const orderService = require('./orderService');

const orderController = {
    list: async (req, res, next) => {
        try {
            const orders = await orderService.listOrders(req.user.sub);
            res.json({ data: orders });
        } catch (error) {
            next(error);
        }
    },

    checkout: async (req, res, next) => {
        try {
            const order = await orderService.checkout(req.user.sub);
            res.status(201).json({
                data: order,
                message: 'Pedido criado com sucesso'
            });
        } catch (error) {
            next(error);
        }
    },

    cancel: async (req, res, next) => {
        try {
            const order = await orderService.cancelOrder(req.user, req.params.id, req.body?.reason);
            res.status(200).json({
                data: order,
                message: 'Pedido cancelado com sucesso'
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = orderController;
