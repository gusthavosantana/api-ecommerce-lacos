const express = require('express');
const orderController = require('./orderController');
const authMiddleware = require('../../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/', orderController.list);
router.post('/', orderController.checkout);
router.post('/:id/cancel', orderController.cancel);

module.exports = router;
