import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';

class BusinessService {
  /**
   * Create a new business
   */
  async createBusiness(data: {
    name: string;
    description?: string;
    category: string;
    phone: string;
    email?: string;
    address?: string;
    minOrderAmount?: number;
    deliveryFee?: number;
    freeDeliveryThreshold?: number;
  }) {
    try {
      // Generate unique slug
      const slug = await this.generateUniqueSlug(data.name);
      
      // Generate unique QR code
      const qrCode = nanoid(12).toUpperCase(); // e.g., "A1B2C3D4E5F6"
      
      // Create business
      const business = await prisma.business.create({
        data: {
          name: data.name,
          slug,
          description: data.description,
          category: data.category,
          phone: data.phone,
          email: data.email,
          address: data.address,
          qrCode,
          minOrderAmount: data.minOrderAmount || 0,
          deliveryFee: data.deliveryFee || 30,
          freeDeliveryThreshold: data.freeDeliveryThreshold || 500,
          isActive: true,
          isVerified: false, // Requires admin approval
        },
      });

      // Generate QR code image
      await this.generateQRCodeImage(business.id, qrCode);

      logger.info(`Business created: ${business.name} (${business.id})`);
      return business;
    } catch (error) {
      logger.error('Error creating business:', error);
      throw error;
    }
  }

  /**
   * Generate unique slug from business name
   */
  private async generateUniqueSlug(name: string): Promise<string> {
    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Check if slug exists
    let existing = await prisma.business.findUnique({ where: { slug } });
    
    if (existing) {
      // Add random suffix
      slug = `${slug}-${nanoid(6).toLowerCase()}`;
    }

    return slug;
  }

  /**
   * Generate QR code image for business
   */
  private async generateQRCodeImage(businessId: string, qrCode: string): Promise<string> {
    try {
      // QR code contains: qr:{code}
      const qrData = `qr:${qrCode}`;
      
      // Generate QR code as data URL
      const qrCodeDataURL = await QRCode.toDataURL(qrData, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      // In production, upload to S3/storage and store URL
      // For now, store the data URL
      await prisma.business.update({
        where: { id: businessId },
        data: { qrCodeImage: qrCodeDataURL },
      });

      logger.info(`QR code generated for business: ${businessId}`);
      return qrCodeDataURL;
    } catch (error) {
      logger.error('Error generating QR code:', error);
      throw error;
    }
  }

  /**
   * Search businesses by name or category
   */
  async searchBusinesses(query: string) {
    try {
      const businesses = await prisma.business.findMany({
        where: {
          AND: [
            { isActive: true },
            {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { category: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
              ],
            },
          ],
        },
        orderBy: [
          { isVerified: 'desc' }, // Verified businesses first
          { name: 'asc' },
        ],
        take: 20,
      });

      return businesses;
    } catch (error) {
      logger.error('Error searching businesses:', error);
      return [];
    }
  }

  /**
   * Get business by QR code
   */
  async getBusinessByQRCode(qrCode: string) {
    try {
      const business = await prisma.business.findUnique({
        where: { qrCode },
      });

      if (!business || !business.isActive) {
        return null;
      }

      return business;
    } catch (error) {
      logger.error('Error getting business by QR code:', error);
      return null;
    }
  }

  /**
   * Get business by ID
   */
  async getBusinessById(id: string) {
    try {
      return await prisma.business.findUnique({
        where: { id },
        include: {
          products: {
            where: { inStock: true },
          },
          operatingHours: true,
        },
      });
    } catch (error) {
      logger.error('Error getting business:', error);
      return null;
    }
  }

  /**
   * Get business by slug
   */
  async getBusinessBySlug(slug: string) {
    try {
      return await prisma.business.findUnique({
        where: { slug },
        include: {
          products: {
            where: { inStock: true },
          },
        },
      });
    } catch (error) {
      logger.error('Error getting business by slug:', error);
      return null;
    }
  }

  /**
   * Update business details
   */
  async updateBusiness(id: string, data: any) {
    try {
      return await prisma.business.update({
        where: { id },
        data,
      });
    } catch (error) {
      logger.error('Error updating business:', error);
      throw error;
    }
  }

  /**
   * Get all businesses (admin)
   */
  async getAllBusinesses(filters?: {
    isActive?: boolean;
    isVerified?: boolean;
    category?: string;
  }) {
    try {
      return await prisma.business.findMany({
        where: filters,
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      logger.error('Error getting all businesses:', error);
      return [];
    }
  }

  /**
   * Verify business (admin action)
   */
  async verifyBusiness(id: string) {
    try {
      return await prisma.business.update({
        where: { id },
        data: { isVerified: true },
      });
    } catch (error) {
      logger.error('Error verifying business:', error);
      throw error;
    }
  }

  /**
   * Deactivate business
   */
  async deactivateBusiness(id: string) {
    try {
      return await prisma.business.update({
        where: { id },
        data: { isActive: false },
      });
    } catch (error) {
      logger.error('Error deactivating business:', error);
      throw error;
    }
  }

  /**
   * Check if business is open now
   */
  async isBusinessOpen(businessId: string): Promise<boolean> {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday
      const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"

      const hours = await prisma.operatingHours.findFirst({
        where: {
          businessId,
          dayOfWeek,
          isClosed: false,
        },
      });

      if (!hours) {
        return false; // Closed if no hours defined
      }

      return currentTime >= hours.openTime && currentTime <= hours.closeTime;
    } catch (error) {
      logger.error('Error checking business hours:', error);
      return false;
    }
  }

  /**
   * Get business stats
   */
  async getBusinessStats(businessId: string) {
    try {
      const [totalOrders, totalRevenue, productCount, favoriteCount] = await Promise.all([
        prisma.order.count({ where: { businessId } }),
        prisma.order.aggregate({
          where: { businessId, status: 'PAID' },
          _sum: { grandTotal: true },
        }),
        prisma.product.count({ where: { businessId } }),
        prisma.favoriteBusiness.count({ where: { businessId } }),
      ]);

      return {
        totalOrders,
        totalRevenue: totalRevenue._sum.grandTotal || 0,
        productCount,
        favoriteCount,
      };
    } catch (error) {
      logger.error('Error getting business stats:', error);
      return null;
    }
  }
}

export default new BusinessService();
