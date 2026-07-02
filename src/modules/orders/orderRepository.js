const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');

const orderRepository = {
    findById: async (orderId) => {
        return await prisma.order.findUnique({
            where: { id: orderId },
            include: { items: true, payment: true }
        });
    },

    findManyByUser: async (userId) => {
        return await prisma.order.findMany({
            where: { userId },
            include: { items: true, payment: true },
            orderBy: { createdAt: 'desc' }
        });
    },

    createOrderTransaction: async (userId, items, totalValue) => {
        // Prisma transaction
        return await prisma.$transaction(async (tx) => {
            // 1. Decrementar Estoque de todos os produtos
            for (const item of items) {
                // Tenta decrementar atomicamente apenas se stock >= quantidade
                // Prisma lança erro se where não der match
                try {
                    await tx.product.update({
                        where: { id: item.productId }, //, stock: { gte: item.quantity } }, // Prisma < 5 filter in update limitation?
                        data: { stock: { decrement: item.quantity } }
                    });

                    // Verificação extra caso o decrement leve a negativo (se banco não tiver check constraint)
                    // Na vdd melhor passo: ler e checkar ou confiar no decrement com check constraint no DB.
                    // Assumindo que o banco não permite unsigned negativo ou check, vai dar erro.
                    // Para garantir no node:
                    const p = await tx.product.findUnique({ where: { id: item.productId } });
                    if (p.stock < 0) throw new Error(`Sem estoque para ${p.name}`);

                } catch (e) {
                    throw new Error(`Falha ao atualizar estoque do produto ${item.productId}`);
                }
            }

            // 2. Criar Order
            const order = await tx.order.create({
                data: {
                    userId,
                    totalValue,
                    status: 'PENDING',
                    items: {
                        create: items.map(i => ({
                            productId: i.productId,
                            quantity: i.quantity,
                            price: i.price
                        }))
                    }
                }
            });

            // 3. Criar Payment Stub
            await tx.payment.create({
                data: {
                    orderId: order.id,
                    status: 'AWAITING_CONFIRMATION'
                    // externalId gerado depois no Payment Gateway
                }
            });

            return order;
        });
    },

    // Cancelamento atômico: libera o estoque de cada item e marca o pedido como
    // CANCELED com dados de auditoria. O update é condicionado ao status atual
    // (single-flight), garantindo que dois cancelamentos concorrentes não liberem
    // estoque em dobro nem gerem dois reembolsos. (FR-005, FR-006, FR-007, FR-012)
    cancelOrderTransaction: async (order, { canceledBy, reason }) => {
        return await prisma.$transaction(async (tx) => {
            // 1. Liberar estoque (inverso da reserva do checkout)
            for (const item of order.items) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: { stock: { increment: item.quantity } }
                });
            }

            // 2. Atualizar status + auditoria condicionado ao status esperado
            const result = await tx.order.updateMany({
                where: { id: order.id, status: order.status },
                data: {
                    status: 'CANCELED',
                    canceledAt: new Date(),
                    canceledBy,
                    cancelReason: reason ?? null
                }
            });

            if (result.count === 0) {
                // Alguém já alterou o status entre a leitura e a escrita.
                throw new AppError(
                    'Pedido não pôde ser cancelado (estado alterado concorrentemente)',
                    409,
                    'CONFLICT'
                );
            }

            // 3. Retornar o pedido atualizado
            return await tx.order.findUnique({
                where: { id: order.id },
                include: { items: true, payment: true }
            });
        });
    }
};

module.exports = orderRepository;
