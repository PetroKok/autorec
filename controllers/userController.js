const {admin, Db} = require('../firebase/firebase');
const {getDealershipBy} = require('./parseController')
const _ = require('lodash');

exports.toggleUserAccess = function (req, res) {
    const user_id = req.params.user_id;

    admin.auth().getUser(user_id)
        .then(function (user) {

            admin.auth().updateUser(user.uid, {disabled: !user.disabled})
                .then(function (userRecord) {

                    const access = !user.disabled === true ? 'disabled' : 'enabled';
                    const message = 'Successfully ' + access + ' access!';
                    res.json({success: true, message: message});

                })
                .catch(function (error) {
                    res.json({success: false, message: error});
                });

        })
        .catch(function (error) {
            res.json({success: false, message: error});
        });
}

exports.parseFile = function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'http://autorecon.dev.oyihost.com');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    const dealership_id = req.params.user_id;
    let customer = {};
    let feedProvider = {};

    return getDealershipBy(dealership_id, res);
}

exports.parseForQueue = function async(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'http://autorecon.dev.oyihost.com');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    res.send({started: true});

    return Db.ref('queue_parse').get()
        .then(async dealer => {
            let data = [];

            await dealer.forEach(snapShot => {
                const item = snapShot.data()
                data.push(item.dealership_id);
                snapShot.ref.delete();
            })

            const promises = await data.map(async dealership_id => {
                console.log('$$$ >>> ', dealership_id);
                var res = await getDealershipBy(dealership_id, res, true)
                await console.log('FOR: ' + dealership_id)
                await console.log(res)
            })

            await Promise.all(promises)


        })
        .catch((error) => {
            console.log(error);
        });


}
