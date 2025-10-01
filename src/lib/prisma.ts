import { PrismaClient } from "@prisma/client";

/**
 * 生产环境启动后就是长时间运行，直接下面一行代码就够了：
 * export const prisma = new PrismaClient({log: ['query']})
 * 根据 prima 官网文档：
 * The object is cached the first time the module is imported. 
 * Subsequent requests return the cached object rather than creating a new PrismaClient.
 * 利用 node.js 的 modules_caching 特性，多次使用不会导致再次创建数据库连接实例。
 * 
 * 因此：globalForPrisma 的存在，只是为了支持开发环境的热加载。
 */

/**
 * 这行代码的目的是让 globalForPrisma 变量能够被视为一个包含 prisma 属性的对象，
 * 这样后续代码可以安全地访问这个属性。
 * 主要是为了应付 Typescript 的类型检查。
 * 
 * 直接将实例赋值给 global 对象的某个属性，即可将实例存储在全局对象 global 上。
 */
const globalForPrisma = global as unknown as {prisma: PrismaClient}

/**
 * globalForPrisma.prisma: 访问 globalForPrisma 对象的 prisma 属性。
 * 如果这个属性已经存在并且是一个 PrismaClient 实例，则使用它。
 * 如果是 undefined 或 null（即还没有设置过 prisma 实例），则创建一个新的 PrismaClient 实例。
 */
export const prisma = globalForPrisma.prisma || new PrismaClient({log: ['query']})

/**
 * 确保在非生产环境中，每次代码热重载时，
 * globalForPrisma.prisma 都会持有已经存在的 PrismaClient 实例，而不会重复创建新的实例。
 */
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma