var express = require('express');
var router = express.Router();

const userController = require('../controllers/userController')

/* GET users listing. */
router.get('/:user_id/toggle-access', userController.toggleUserAccess);

router.get('/:user_id/parse', userController.parseFile);

router.get('/test', function (req, res) {
    console.log('STARTED GOOD!');
    res.json({status: 'ok'});
});

module.exports = router;
