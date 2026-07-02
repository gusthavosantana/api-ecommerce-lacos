// Testes caixa-branca do comportamento transacional de cancelOrderTransaction.
// Mocka o prisma para provar: increment de estoque por item, update de status/auditoria
// condicionado ao status atual (single-flight) e atomicidade.
jest.mock('../../../config/database', () => ({
    $transaction: jest.fn(),
    order: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
    },
    product: {
        update: jest.fn(),
    },
}));

const prisma = require('../../../config/database');
const orderRepository = require('../orderRepository');

const buildOrder = (overrides = {}) => ({
    id: 'order-1',
    userId: 'user-1',
    status: 'PENDING',
    totalValue: 150,
    items: [
        { productId: 'prod-a', quantity: 2, price: 50 },
        { productId: 'prod-b', quantity: 1, price: 50 },
    ],
    ...overrides,
});

// tx expõe os mesmos delegates do prisma mockado.
const tx = {
    order: prisma.order,
    product: prisma.product,
};

beforeEach(() => {
    // $transaction executa o callback passando o tx mockado.
    prisma.$transaction.mockImplementation(async (cb) => cb(tx));
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
    prisma.order.findUnique.mockResolvedValue(buildOrder({ status: 'CANCELED' }));
    prisma.product.update.mockResolvedValue({});
});

describe('orderRepository.cancelOrderTransaction', () => {
    it('incrementa o estoque de cada item pela respectiva quantidade', async () => {
        const order = buildOrder();

        await orderRepository.cancelOrderTransaction(order, { canceledBy: 'user-1', reason: null });

        expect(prisma.product.update).toHaveBeenCalledTimes(2);
        expect(prisma.product.update).toHaveBeenCalledWith({
            where: { id: 'prod-a' },
            data: { stock: { increment: 2 } },
        });
        expect(prisma.product.update).toHaveBeenCalledWith({
            where: { id: 'prod-b' },
            data: { stock: { increment: 1 } },
        });
    });

    it('atualiza status para CANCELED com auditoria, condicionado ao status atual (single-flight)', async () => {
        const order = buildOrder({ status: 'PAID' });

        await orderRepository.cancelOrderTransaction(order, { canceledBy: 'admin-9', reason: 'motivo' });

        expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
        const arg = prisma.order.updateMany.mock.calls[0][0];
        // Guarda de concorrência: só atualiza se ainda estiver no status esperado.
        expect(arg.where).toMatchObject({ id: 'order-1', status: 'PAID' });
        expect(arg.data).toMatchObject({
            status: 'CANCELED',
            canceledBy: 'admin-9',
            cancelReason: 'motivo',
        });
        expect(arg.data.canceledAt).toBeInstanceOf(Date);
    });

    it('tudo roda dentro de uma única transação atômica', async () => {
        await orderRepository.cancelOrderTransaction(buildOrder(), { canceledBy: 'user-1', reason: null });
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('concorrência: se o update condicional não afetar linhas, lança 409 e não confirma', async () => {
        prisma.order.updateMany.mockResolvedValue({ count: 0 });

        await expect(
            orderRepository.cancelOrderTransaction(buildOrder(), { canceledBy: 'user-1', reason: null })
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('propaga falha na liberação de estoque (atomicidade — nada parcial)', async () => {
        prisma.product.update.mockRejectedValueOnce(new Error('db down'));

        await expect(
            orderRepository.cancelOrderTransaction(buildOrder(), { canceledBy: 'user-1', reason: null })
        ).rejects.toThrow();
    });
});
