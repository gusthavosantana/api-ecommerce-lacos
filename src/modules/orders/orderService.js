const orderRepository = require('./orderRepository');
const cartService = require('../cart/cartService');
const productRepository = require('../products/productRepository');
const paymentService = require('../payments/paymentService');
const AppError = require('../../utils/AppError');
const logger = require('../../config/logger');

// Estados a partir dos quais o pedido ainda pode ser cancelado. (FR-002)
const CANCELABLE_STATUSES = ['PENDING', 'PAID'];

const orderService = {
    listOrders: async (userId) => {
        return await orderRepository.findManyByUser(userId);
    },

    // Cancela um pedido aplicando as regras de permissão, estado e reembolso.
    // actor = { sub, role }. reason é opcional para o cliente e obrigatório p/ admin.
    cancelOrder: async (actor, orderId, reason) => {
        const order = await orderRepository.findById(orderId);

        // Pedido inexistente — erro claro, sem vazar dados de outros clientes. (FR-010)
        if (!order) {
            throw new AppError('Pedido não encontrado', 404, 'RESOURCE_NOT_FOUND');
        }

        const isAdmin = actor.role === 'ADMIN';

        // Um usuário comum só pode cancelar os próprios pedidos. (FR-003)
        if (!isAdmin && order.userId !== actor.sub) {
            throw new AppError('Você não tem permissão para cancelar este pedido', 403, 'FORBIDDEN');
        }

        // Idempotência: já cancelado não altera estoque/pagamento/estado. (FR-006)
        if (order.status === 'CANCELED') {
            logger.info(`Cancelamento idempotente: pedido ${order.id} já estava cancelado`);
            return order;
        }

        // Somente estados canceláveis; enviado/entregue/concluído são rejeitados. (FR-002)
        if (!CANCELABLE_STATUSES.includes(order.status)) {
            throw new AppError(
                'Este pedido não pode mais ser cancelado. Entre em contato com o suporte para devolução.',
                409,
                'CONFLICT'
            );
        }

        // Motivo é obrigatório quando o cancelamento é feito por um admin. (FR-013)
        if (isAdmin && (!reason || !reason.trim())) {
            throw new AppError('O motivo do cancelamento é obrigatório para administradores', 400, 'INVALID_PAYLOAD');
        }

        // Transação atômica: libera estoque + marca CANCELED + auditoria. (FR-004,005,007,012)
        const canceledOrder = await orderRepository.cancelOrderTransaction(order, {
            canceledBy: actor.sub,
            reason: reason ?? null
        });

        // Pedido pago → iniciar reembolso do valor total. (FR-008)
        // Expõe o status do reembolso na resposta para dar visibilidade ao cliente
        // de que ele está em processamento (US2). (FR-008, FR-010)
        if (order.status === 'PAID') {
            const refund = await paymentService.initiateRefund(order);
            canceledOrder.refundStatus = refund.refundStatus;
            if (canceledOrder.payment) {
                canceledOrder.payment.refundStatus = refund.refundStatus;
            }
        }

        // Evento de cancelamento para integrações/rastreabilidade. (FR-009)
        logger.info(`Evento Emitido: order.canceled { orderId: ${order.id}, canceledBy: ${actor.sub} }`);

        return canceledOrder;
    },

    checkout: async (userId) => {
        // 1. Recuperar Carrinho
        const cart = await cartService.getCart(userId);
        if (!cart || cart.items.length === 0) {
            throw new AppError('Carrinho vazio', 400, 'INVALID_PAYLOAD');
        }

        // 2. Recalcular Preços e Validar (Snapshot)
        let totalValue = 0;
        const validItems = [];

        for (const item of cart.items) {
            const product = await productRepository.findById(item.productId);
            if (!product) {
                throw new AppError(`Produto ${item.productId} não existe mais`, 409, 'CONFLICT');
            }
            if (product.stock < item.quantity) {
                throw new AppError(`Estoque insuficiente para ${product.name}`, 409, 'OUT_OF_STOCK');
            }
            if (product.status !== 'ACTIVE') {
                throw new AppError(`Produto ${product.name} indisponível`, 409, 'CONFLICT');
            }

            validItems.push({
                productId: product.id,
                quantity: item.quantity,
                price: Number(product.price)
            });
            totalValue += Number(product.price) * item.quantity;
        }

        // 3. Executar Transação no Banco
        let order;
        try {
            order = await orderRepository.createOrderTransaction(userId, validItems, totalValue);
        } catch (error) {
            logger.error(`Checkout falhou: ${error.message}`);
            throw new AppError('Erro ao processar pedido ou estoque', 500, 'INTERNAL_SERVER_ERROR');
        }

        // 4. Limpar Carrinho
        // Como o redis remove item a item, seria bom ter um clearCart.
        // Vou simular um clear setando vazio ou iterando.
        // O ideal é implementar clear no cartService.
        // Por hora, vou expirar a chave ou deletar.
        const redisClient = require('../../config/redis');
        await redisClient.del(`cart:default:${userId}`);

        // 5. Emitir Evento (Simulado)
        logger.info(`Evento Emitido: order.created { orderId: ${order.id} }`);

        return order;
    }
};

module.exports = orderService;
