import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { StripeService } from 'src/stripe/stripe.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const { email, password } = createUserDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    const role = await this.prisma.role.findUnique({
      where: { name: createUserDto.role },
    });

    if (!role) {
      throw new ConflictException(
        `Invalid Role... available roles: 'admin','staff','customer'`,
      );
    }
    delete createUserDto.role;

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    if (createUserDto.priority && role.name === 'staff') {
      const inputPriority = createUserDto.priority;

      // Count current staff members
      const totalStaff = await this.prisma.user.count({
        where: { roleId: role.id },
      });

      // Cap priority to (totalStaff + 1)
      const finalPriority = Math.min(inputPriority, totalStaff + 1);

      createUserDto.priority = finalPriority;

      // Shift down existing priorities if needed
      await this.prisma.user.updateMany({
        where: {
          roleId: role.id,
          priority: {
            gte: finalPriority,
          },
        },
        data: {
          priority: {
            increment: 1,
          },
        },
      });
    }

    // Hash password
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Create user
    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        role: {
          connect: { id: role.id },
        },
        password: hashedPassword,
      },
      include: {
        role: true,
      },
    });

    // Remove password from response
    const { password: _, ...result } = user;
    return result;
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        roleId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findByRole(roleName: string) {
    return this.prisma.user.findMany({
      where: {
        role: {
          name: roleName,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        roleId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findallroles() {
    return this.prisma.role.findMany({
      select: {
        id: true,
        name: true,
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        roleId: true,
        role: true,
        addresses: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findOrCreateUser(data: {
    email: string;
    name: string;
    role: string;
    phone?: string;
  }) {
    let user: any = await this.findByEmail(data.email);
    if (!user) {
      // create Stripe customer first
      const stripeCustomer = await this.stripeService.createCustomer(
        data.email,
        data.name,
      );

      user = await this.create({
        ...data,
        stripe_customer_id: stripeCustomer.id, // save Stripe customer ID here
      });
    }
    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
      },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    // Check if user exists
    await this.findOne(id);

    // Prepare update data
    const updateData: any = { ...updateUserDto };

    // If updating password, hash it
    if (updateUserDto.password) {
      updateData.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    // Update user
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        roleId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async remove(id: string) {
    // Check if user exists
    await this.findOne(id);

    // Delete user
    await this.prisma.user.delete({
      where: { id },
    });

    return { message: `User with ID ${id} deleted successfully` };
  }

  async addAddress(userId: string, addressData: any) {
    // Check if user exists
    await this.findOne(userId);

    // Create address
    const address = await this.prisma.address.create({
      data: {
        ...addressData,
        userId,
      },
    });

    return address;
  }

  async updateAddress(userId: string, addressId: string, addressData: any) {
    // Check if user exists
    await this.findOne(userId);

    // Check if address exists and belongs to user
    const existingAddress = await this.prisma.address.findFirst({
      where: {
        id: addressId,
        userId,
      },
    });

    if (!existingAddress) {
      throw new NotFoundException(
        `Address with ID ${addressId} not found for this user`,
      );
    }

    // Update address
    const updatedAddress = await this.prisma.address.update({
      where: { id: addressId },
      data: addressData,
    });

    return updatedAddress;
  }

  async removeAddress(userId: string, addressId: string) {
    // Check if user exists
    await this.findOne(userId);

    // Check if address exists and belongs to user
    const existingAddress = await this.prisma.address.findFirst({
      where: {
        id: addressId,
        userId,
      },
    });

    if (!existingAddress) {
      throw new NotFoundException(
        `Address with ID ${addressId} not found for this user`,
      );
    }

    // Delete address
    await this.prisma.address.delete({
      where: { id: addressId },
    });

    return { message: `Address with ID ${addressId} deleted successfully` };
  }

  async setDefaultAddress(userId: string, addressId: string) {
    // Check if user exists
    await this.findOne(userId);

    // Check if address exists and belongs to user
    const existingAddress = await this.prisma.address.findFirst({
      where: {
        id: addressId,
        userId,
      },
    });

    if (!existingAddress) {
      throw new NotFoundException(
        `Address with ID ${addressId} not found for this user`,
      );
    }

    // First reset all addresses for this user to not default
    await this.prisma.address.updateMany({
      where: { userId },
      data: { isDefault: false },
    });

    // Then set the specified address as default
    const updatedAddress = await this.prisma.address.update({
      where: { id: addressId },
      data: { isDefault: true },
    });

    return updatedAddress;
  }
}
