var express = require('express');
var router = express.Router();

const userController = require('../controllers/userController')
const serviceController = require('../controllers/serviceController')

/* GET users listing. */
router.get('/:user_id/toggle-access', userController.toggleUserAccess);

router.get('/:user_id/parse', userController.parseFile);

router.get('/parse_queue', userController.parseForQueue);

router.get('/service', serviceController.parseAllDealers);

router.get('/delete', userController.delete);

module.exports = router;
