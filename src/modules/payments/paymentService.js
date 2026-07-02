const paymentRepository = require('./paymentRepository');
const prisma = require('../../config/database'); // Para atualizar order status cross-module, ideal via event ou service, aqui direto no prisma pra simplificar transaction
const AppError = require('../../utils/AppError');
const logger = require('../../config/logger');

const paymentService = {
    createPaymentIntent: async (orderId) => {
        // Verifica se já existe
        const existing = await paymentRepository.findByOrderId(orderId);
        if (existing) return existing;

        return await paymentRepository.create({
            orderId,
            status: 'AWAITING_CONFIRMATION'
        });
    },

    confirmPayment: async (paymentId, idempotencyKey) => {
        if (!idempotencyKey) {
            throw new AppError('Header Idempotency-Key obrigatório', 400, 'INVALID_PAYLOAD');
        }

        const payment = await paymentRepository.findById(paymentId);
        if (!payment) {
            throw new AppError('Pagamento não encontrado', 404, 'RESOURCE_NOT_FOUND');
        }

        if (payment.status === 'PAID') {
            return payment; // Idempotência simples
        }

        // Transação: Update Payment e Order
        const result = await prisma.$transaction(async (tx) => {
            const updatedPayment = await tx.payment.update({
                where: { id: paymentId },
                data: { status: 'PAID' }
            });

            await tx.order.update({
                where: { id: payment.orderId },
                data: { status: 'PAID' }
            });

            return updatedPayment;
        });

        logger.info(`Evento Emitido: order.paid { orderId: ${payment.orderId} }`);
        return result;
    },

    cancelPayment: async (paymentId) => {
        const payment = await paymentRepository.findById(paymentId);
        if (!payment) {
            throw new AppError('Pagamento não encontrado', 404, 'RESOURCE_NOT_FOUND');
        }

        // Transação: Cancel Payment, Order e Devolver Estoque (opcional, mas recomendado)
        // Aqui apenas cancela status
        await prisma.$transaction(async (tx) => {
            await tx.payment.update({
                where: { id: paymentId },
                data: { status: 'CANCELED' }
            });

            await tx.order.update({
                where: { id: payment.orderId },
                data: { status: 'CANCELED' }
            });
        });

        return { message: 'Pagamento e Pedido cancelados' };
    },

    // Inicia o reembolso de um pedido pago. A conclusão efetiva é assíncrona
    // (depende do provedor de pagamento), por isso apenas marcamos o reembolso
    // como PROCESSING e emitimos o evento correspondente. (FR-008)
    initiateRefund: async (order) => {
        const payment = await paymentRepository.findByOrderId(order.id);
        if (!payment) {
            throw new AppError('Pagamento não encontrado para reembolso', 404, 'RESOURCE_NOT_FOUND');
        }

        const updated = await prisma.payment.update({
            where: { id: payment.id },
            data: { refundStatus: 'PROCESSING' }
        });

        logger.info(
            `Evento Emitido: payment.refund.initiated { orderId: ${order.id}, amount: ${order.totalValue} }`
        );

        return { refundStatus: updated.refundStatus, amount: Number(order.totalValue) };
    }
};

module.exports = paymentService;
