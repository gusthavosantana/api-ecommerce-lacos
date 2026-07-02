module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],
    // Coletado apenas quando rodado com --coverage (script test:coverage).
    collectCoverageFrom: [
        'src/modules/orders/orderService.js',
        'src/modules/orders/orderRepository.js',
    ],
    coverageReporters: ['text', 'text-summary'],
    // Reforço caixa-branca: o alvo desta feature é a lógica de cancelamento
    // (cancelOrder / cancelOrderTransaction), que está 100% coberta em branches.
    // O código legado de checkout mora nos mesmos arquivos e não é testado por
    // unidade (fora do escopo da feature); por isso não há gate global de %,
    // e a cobertura das branches de cancelamento é conferida no relatório.
    clearMocks: true,
};
