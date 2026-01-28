import whatsappService from './360dialog.service';
import businessService from '../business/business.service';
import cartService from '../order/cart.service';
import orderService from '../order/order.service';
import { getRedis } from '../../config/redis';
import prisma from '../../config/database';
import { logger } from '../../utils/logger';

export interface IncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'interactive' | 'button' | 'image';
  text?: {
    body: string;
  };
  interactive?: {
    type: string;
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
    };
  };
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
}

class MessageHandler {
  private redis = getRedis();

  /**
   * Main message router
   */
  async handleMessage(message: IncomingMessage): Promise<void> {
    const { from, type } = message;
    
    try {
      // Get or create user
      const user = await this.getOrCreateUser(from);
      
      // Get user session
      const session = await this.getSession(from);
      
      // Extract message content
      const messageText = this.extractMessageText(message);
      
      logger.info(`Message from ${from}: ${messageText || type}`);
      
      // Handle QR code image scanning
      if (type === 'image') {
        await this.handleQRCodeScan(from, message);
        await whatsappService.markAsRead(message.id);
        return;
      }
      
      // Route based on session state
      const state = session?.state || 'START';
      const currentBusinessId = session?.businessId;
      
      switch (state) {
        case 'START':
          await this.handleStart(from, user);
          break;
        case 'BUSINESS_SELECTION':
          await this.handleBusinessSelection(from, messageText);
          break;
        case 'SEARCHING_BUSINESS':
          await this.handleBusinessSearch(from, messageText);
          break;
        case 'BROWSING_CATEGORIES':
          await this.handleCategoryBrowsing(from, messageText, currentBusinessId!);
          break;
        case 'BROWSING_PRODUCTS':
          await this.handleProductBrowsing(from, messageText, session);
          break;
        case 'VIEWING_PRODUCT':
          await this.handleProductViewing(from, messageText, session);
          break;
        case 'IN_CART':
          await this.handleCart(from, messageText, currentBusinessId!);
          break;
        case 'CHECKOUT':
          await this.handleCheckout(from, messageText, session);
          break;
        default:
          await this.handleStart(from, user);
      }
      
      // Mark message as read
      await whatsappService.markAsRead(message.id);
    } catch (error) {
      logger.error('Error handling message:', error);
      await whatsappService.sendText(
        from,
        '❌ Sorry, something went wrong. Type *start* to begin again.'
      );
    }
  }

  /**
   * Extract text from different message types
   */
  private extractMessageText(message: IncomingMessage): string {
    if (message.type === 'text' && message.text) {
      return message.text.body.toLowerCase().trim();
    }
    if (message.type === 'interactive' && message.interactive) {
      if (message.interactive.button_reply) {
        return message.interactive.button_reply.id;
      }
      if (message.interactive.list_reply) {
        return message.interactive.list_reply.id;
      }
    }
    return '';
  }

  /**
   * Handle QR code scan
   */
  private async handleQRCodeScan(phone: string, message: IncomingMessage): Promise<void> {
    try {
      // Extract QR code from caption or process image
      const caption = message.image?.caption?.toLowerCase().trim();
      
      if (caption && caption.startsWith('qr:')) {
        // QR code identifier sent as caption
        const qrCode = caption.replace('qr:', '').trim();
        const business = await businessService.getBusinessByQRCode(qrCode);
        
        if (business) {
          await this.selectBusiness(phone, business.id);
          return;
        }
      }
      
      // If no valid QR found, prompt user
      await whatsappService.sendText(
        phone,
        '📸 QR code scanning...\n\nPlease make sure the QR code is clear and try again, or search for the business by name.'
      );
      
    } catch (error) {
      logger.error('Error handling QR code:', error);
      await whatsappService.sendText(
        phone,
        '❌ Could not read QR code. Please try again or search by business name.'
      );
    }
  }

  /**
   * Handle initial greeting - Business selection
   */
  private async handleStart(phone: string, user: any): Promise<void> {
    const greeting = `👋 Welcome ${user.name || 'there'}!

🛍️ *Multi-Business Ordering Platform*

Choose how you'd like to access a business:`;

    await whatsappService.sendButtons(phone, greeting, [
      { id: 'scan_qr', title: '📸 Scan QR Code' },
      { id: 'search_business', title: '🔍 Search Business' },
      { id: 'view_favorites', title: '⭐ My Favorites' },
    ]);

    await this.updateSession(phone, { state: 'BUSINESS_SELECTION' });
  }

  /**
   * Handle business selection method
   */
  private async handleBusinessSelection(phone: string, choice: string): Promise<void> {
    switch (choice) {
      case 'scan_qr':
        await this.promptQRScan(phone);
        break;
      case 'search_business':
        await this.promptBusinessSearch(phone);
        break;
      case 'view_favorites':
        await this.showFavorites(phone);
        break;
      default:
        if (choice.includes('start') || choice.includes('menu')) {
          const user = await this.getOrCreateUser(phone);
          await this.handleStart(phone, user);
        } else {
          await whatsappService.sendText(phone, "Please use the buttons or type *start*.");
        }
    }
  }

  /**
   * Prompt user to scan QR code
   */
  private async promptQRScan(phone: string): Promise<void> {
    const message = `📸 *Scan Business QR Code*

To access a business:
1. Take a photo of their QR code
2. Send the photo here

Or type *search* to search by name instead.`;

    await whatsappService.sendText(phone, message);
    await this.updateSession(phone, { state: 'BUSINESS_SELECTION' });
  }

  /**
   * Prompt user to search for business
   */
  private async promptBusinessSearch(phone: string): Promise<void> {
    const message = `🔍 *Search for Business*

Type the name of the business you're looking for:

Examples:
• "Premium Meats"
• "Joe's Butchery"
• "Fresh Cuts"

Or type *start* to go back.`;

    await whatsappService.sendText(phone, message);
    await this.updateSession(phone, { state: 'SEARCHING_BUSINESS' });
  }

  /**
   * Handle business search
   */
  private async handleBusinessSearch(phone: string, searchQuery: string): Promise<void> {
    if (searchQuery.includes('start') || searchQuery.includes('back')) {
      const user = await this.getOrCreateUser(phone);
      await this.handleStart(phone, user);
      return;
    }

    const businesses = await businessService.searchBusinesses(searchQuery);

    if (businesses.length === 0) {
      await whatsappService.sendText(
        phone,
        `😔 No businesses found for "${searchQuery}"\n\nTry a different search or type *start* to go back.`
      );
      return;
    }

    if (businesses.length === 1) {
      // Only one result, select automatically
      await this.selectBusiness(phone, businesses[0].id);
      return;
    }

    // Multiple results - show list
    const sections = [{
      title: 'Search Results',
      rows: businesses.slice(0, 10).map((b) => ({
        id: `biz_${b.id}`,
        title: b.name,
        description: b.category,
      })),
    }];

    await whatsappService.sendList(
      phone,
      `🔍 Found ${businesses.length} business${businesses.length > 1 ? 'es' : ''}:\n\nSelect one to continue:`,
      'View Businesses',
      sections
    );

    await this.updateSession(phone, { state: 'BUSINESS_SELECTION' });
  }

  /**
   * Show user's favorite businesses
   */
  private async showFavorites(phone: string): Promise<void> {
    const user = await prisma.user.findUnique({ 
      where: { phone },
      include: {
        favorites: {
          include: {
            business: true,
          },
        },
      },
    });

    if (!user || user.favorites.length === 0) {
      await whatsappService.sendButtons(
        phone,
        '⭐ You have no favorite businesses yet.\n\nStart ordering from a business and add them to favorites!',
        [
          { id: 'search_business', title: '🔍 Search Business' },
          { id: 'scan_qr', title: '📸 Scan QR Code' },
        ]
      );
      return;
    }

    const sections = [{
      title: 'Your Favorites',
      rows: user.favorites.map((fav) => ({
        id: `biz_${fav.business.id}`,
        title: fav.business.name,
        description: fav.business.category,
      })),
    }];

    await whatsappService.sendList(
      phone,
      `⭐ *Your Favorite Businesses* (${user.favorites.length})\n\nSelect one to order:`,
      'View Favorites',
      sections
    );

    await this.updateSession(phone, { state: 'BUSINESS_SELECTION' });
  }

  /**
   * Select a business and show its menu
   */
  private async selectBusiness(phone: string, businessId: string): Promise<void> {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business || !business.isActive) {
      await whatsappService.sendText(
        phone,
        '❌ This business is currently unavailable. Please try another one.'
      );
      const user = await this.getOrCreateUser(phone);
      await this.handleStart(phone, user);
      return;
    }

    // Check if business is in user's favorites
    const user = await prisma.user.findUnique({ where: { phone } });
    const isFavorite = await prisma.favoriteBusiness.findFirst({
      where: {
        userId: user!.id,
        businessId: business.id,
      },
    });

    const greeting = `🏪 *${business.name}*

${business.description || 'Quality products delivered to your door'}

What would you like to do?`;

    const buttons = [
      { id: 'browse_menu', title: '📖 Browse Menu' },
      { id: 'view_cart', title: '🛒 View Cart' },
      isFavorite 
        ? { id: 'remove_favorite', title: '💔 Remove Favorite' }
        : { id: 'add_favorite', title: '⭐ Add to Favorites' },
    ];

    await whatsappService.sendButtons(phone, greeting, buttons);

    await this.updateSession(phone, { 
      state: 'BROWSING_CATEGORIES',
      businessId: business.id,
    });
  }

  /**
   * Handle category browsing within selected business
   */
  private async handleCategoryBrowsing(phone: string, choice: string, businessId: string): Promise<void> {
    const business = await prisma.business.findUnique({ where: { id: businessId } });

    switch (choice) {
      case 'browse_menu':
        await this.showCategories(phone, businessId);
        break;
      case 'view_cart':
        await this.showCart(phone, businessId);
        break;
      case 'add_favorite':
        await this.addToFavorites(phone, businessId);
        break;
      case 'remove_favorite':
        await this.removeFromFavorites(phone, businessId);
        break;
      case 'change_business':
        const user = await this.getOrCreateUser(phone);
        await this.handleStart(phone, user);
        break;
      default:
        if (choice.startsWith('cat_')) {
          await this.showProductsInCategory(phone, choice.replace('cat_', ''), businessId);
        } else if (choice.includes('start')) {
          const user = await this.getOrCreateUser(phone);
          await this.handleStart(phone, user);
        }
    }
  }

  /**
   * Show product categories for business
   */
  private async showCategories(phone: string, businessId: string): Promise<void> {
    // Get unique categories for this business
    const categories = await prisma.product.groupBy({
      by: ['category'],
      where: {
        businessId,
        inStock: true,
      },
    });

    if (categories.length === 0) {
      await whatsappService.sendText(
        phone,
        '😔 No products available at the moment. Please check back later!'
      );
      return;
    }

    const categoryButtons = categories.slice(0, 3).map((cat) => ({
      id: `cat_${cat.category}`,
      title: `${this.getCategoryEmoji(cat.category)} ${cat.category}`,
    }));

    await whatsappService.sendButtons(
      phone,
      '📖 Select a category to browse:',
      categoryButtons
    );

    if (categories.length > 3) {
      const moreCategories = categories.slice(3).map((cat) => ({
        id: `cat_${cat.category}`,
        title: cat.category,
      }));
      
      await whatsappService.sendButtons(
        phone,
        'More categories:',
        moreCategories.slice(0, 3)
      );
    }

    await this.updateSession(phone, { state: 'BROWSING_PRODUCTS', businessId });
  }

  /**
   * Show products in category
   */
  private async showProductsInCategory(phone: string, category: string, businessId: string): Promise<void> {
    const products = await prisma.product.findMany({
      where: {
        businessId,
        category,
        inStock: true,
      },
      orderBy: { name: 'asc' },
    });

    if (products.length === 0) {
      await whatsappService.sendText(phone, `No ${category} products available right now.`);
      await this.showCategories(phone, businessId);
      return;
    }

    const sections = [{
      title: category.toUpperCase(),
      rows: products.map((p) => ({
        id: `prod_${p.id}`,
        title: p.name,
        description: `R${p.price}/${p.unit}`,
      })),
    }];

    await whatsappService.sendList(
      phone,
      `${this.getCategoryEmoji(category)} *${category.toUpperCase()}*\n\nSelect a product:`,
      'View Products',
      sections
    );

    await this.updateSession(phone, { 
      state: 'VIEWING_PRODUCT',
      businessId,
      category,
    });
  }

  /**
   * Get emoji for category
   */
  private getCategoryEmoji(category: string): string {
    const emojiMap: Record<string, string> = {
      beef: '🐄',
      chicken: '🐔',
      pork: '🐷',
      lamb: '🐑',
      bbq: '🔥',
      specials: '⭐',
      seafood: '🐟',
      vegetables: '🥬',
      dairy: '🧀',
    };
    return emojiMap[category.toLowerCase()] || '🛒';
  }

  // ... Continue with remaining methods (cart, checkout, etc) ...
  // These remain largely the same but now include businessId context

  private async handleProductBrowsing(phone: string, choice: string, session: any): Promise<void> {
    // Implementation similar to before
  }

  private async handleProductViewing(phone: string, choice: string, session: any): Promise<void> {
    // Implementation similar to before
  }

  private async showCart(phone: string, businessId: string): Promise<void> {
    // Cart showing for specific business
  }

  private async handleCart(phone: string, choice: string, businessId: string): Promise<void> {
    // Cart actions for specific business
  }

  private async handleCheckout(phone: string, choice: string, session: any): Promise<void> {
    // Checkout flow
  }

  /**
   * Add business to favorites
   */
  private async addToFavorites(phone: string, businessId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { phone } });
    
    await prisma.favoriteBusiness.create({
      data: {
        userId: user!.id,
        businessId,
      },
    });

    await whatsappService.sendText(phone, '⭐ Added to favorites!');
  }

  /**
   * Remove business from favorites
   */
  private async removeFromFavorites(phone: string, businessId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { phone } });
    
    await prisma.favoriteBusiness.deleteMany({
      where: {
        userId: user!.id,
        businessId,
      },
    });

    await whatsappService.sendText(phone, '💔 Removed from favorites.');
  }

  /**
   * Get or create user
   */
  private async getOrCreateUser(phone: string) {
    let user = await prisma.user.findUnique({ where: { phone } });
    
    if (!user) {
      user = await prisma.user.create({
        data: { phone },
      });
      logger.info(`New user created: ${phone}`);
    }
    
    return user;
  }

  /**
   * Get session
   */
  private async getSession(phone: string): Promise<any> {
    const sessionData = await this.redis.get(`session:${phone}`);
    return sessionData ? JSON.parse(sessionData) : null;
  }

  /**
   * Update session
   */
  private async updateSession(phone: string, data: any): Promise<void> {
    const existing = await this.getSession(phone);
    const updated = { ...existing, ...data, updatedAt: Date.now() };
    await this.redis.setex(`session:${phone}`, 1800, JSON.stringify(updated));
  }
}

export default new MessageHandler();
