var express = require('express');
var router = express.Router();

const userController = require('../controllers/userController')

/* GET users listing. */
router.get('/:user_id/toggle-access', userController.toggleUserAccess);

router.get('/:user_id/parse', userController.parseFile);

module.exports = router;
