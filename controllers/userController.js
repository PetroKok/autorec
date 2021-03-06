const {admin, Db} = require('../firebase/firebase');
const {getDealershipBy} = require('./parseController')
const _ = require('lodash');
const moment = require('moment');

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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    const dealership_id = req.params.user_id;

    return getDealershipBy(dealership_id, res);
}

exports.parseForQueue = function async(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
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

            // dealership_id
            // return !!customer.feedProviderId && customer.feedFileName.trim() !== '' && customer.feedFileName.trim() !== undefined;

            const promises = await data.map(async dealership_id => {
                console.log('$$$ >>> ', dealership_id);
                var dealership = await Db.ref('dealerships').doc(dealership_id).get()
                DL = await dealership.data();

                if (!!DL.feedProviderId && DL.feedFileName.trim() !== '' && DL.feedFileName.trim() !== undefined) {
                    var res = await getDealershipBy(dealership_id, res, true)
                    // await console.log('FOR: ' + dealership_id)
                    // await console.log(res)
                } else {
                    console.log('feedProviderId or/and feedFileName are not provided!');
                }

            })
            await Promise.all(promises)
        })
        .catch((error) => {
            console.log(error);
        });


}

exports.delete = function (res, req) {

    const userCreatedDaysDecider = -1;
    const userCreatedCutOffDate = moment().add(userCreatedDaysDecider, 'days').toDate()
    //
    Db.ref('products')
        .where('dealershipId', '==', 'Petro Dealership | 2020-11-26T12:15:51+02:00')
        .where('lastUpdate', '>', userCreatedCutOffDate)
        .get()
        .then(async items => {
            let data = [];
            console.log(items.size)
            await items.forEach(snapShot => {
                const item = snapShot.data()
                // snapShot.ref.delete();
            })
            console.log(data.length);
        })
}