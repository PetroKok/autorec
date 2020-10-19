const {admin, storage} = require('../firebase/firebase');
const Client = require('ftp');
const moment = require('moment');
const papa = require('papaparse');
const fs = require('fs');

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
    const dealer_id = req.params.user_id;
    let customer = {};
    return admin.firestore().collection('dealerships')
        .where('id', '==', dealer_id).limit(1).get()
        .then(async dealer => {
            let data = [];

            await dealer.forEach(snapShot => {
                const item = snapShot.data()
                data[item.id] = item
            })

            console.log("Dealership found and ID is " + dealer_id);

            const {feedProviderId} = data[dealer_id];
            customer = data[dealer_id];

            console.log("Going to find Feed provider template for " + dealer_id);

            return admin.firestore().collection('feedProviders').doc(feedProviderId).get();
        })
        .then(feedProviderSnapShot => {

            const feedProvider = feedProviderSnapShot.data()

            const feedFileName = feedProvider.credentials.filename

            let dslFolder = feedProvider.credentials.folder
            let serverFilePath = dslFolder + feedFileName

            let config = {
                host: feedProvider.credentials.host,
                user: feedProvider.credentials.username,
                password: feedProvider.credentials.password,
                port: feedProvider.credentials.port || 21,
            }

            var file = storage.file('feeds/' + 'dealertrend.csv');

            console.log('File will be here: feeds/' + feedFileName);

            return admin.firestore().collection('dealer_parser')
                .where('dealership_id', '==', dealer_id)
                .where('feedFileName', '==', feedFileName)
                .where('finished', '==', false)
                .limit(1).get()
                .then(async dealer => {

                    let data = [];

                    dealer.forEach(snapShot => {
                        const item = snapShot.data()
                        data[item.dealership_id] = item
                    })

                    if (Object.keys(data).length !== 0) {
                        data = data[dealer_id];
                        if (data.length !== 0 && data.feedFileName === feedFileName) {
                            console.log('Parsing process already running!');
                            return res.json({downloaded: true, message: 'Parsing process already running!'});
                        }
                    } else {
                        await admin.firestore().collection('dealer_parser').doc().set({
                            feedFileName: feedFileName,
                            dealership_id: dealer_id,
                            finished: false,
                        });
                        console.log('Created new dealer_parser');
                        await downloadFeed();
                    }

                })
                .catch(err => {
                    console.log(err);
                    return res.json({downloaded: false, message: 'Internal Error with dealer_parser', error: err});
                })

            function downloadFeed() {
                var c = new Client()

                c.once('ready', function () {
                    console.log('Ready to connect to FTP!');

                    c.lastMod(serverFilePath, function (err, date) {
                        if (err) throw err;

                        console.log('Last modified!')
                        console.log(date)

                        const serverModifiedDate = moment(date)
                        const serverCutoffDate = moment().add(-1, 'hours')

                        if (false && serverModifiedDate.isBefore(serverCutoffDate)) {
                            return res.json({downloaded: false, message: 'Inventory file not updated!'});
                        } else {
                            c.get(serverFilePath, function (err, stream) {
                                if (err) throw err;
                                console.log('Reading file!');
                                console.log(serverFilePath);
                                stream.pipe(fs.createWriteStream(serverFilePath))

                                stream.on('finish', function () {
                                    console.log('Store file!');
                                    c.end()
                                    parse(fs.createReadStream(serverFilePath), customer, feedProvider, res);
                                    return {downloaded: true};
                                })

                                stream.once('close', function () {
                                    c.end();
                                });
                                stream.on('error', function (err) {
                                    console.log('Stream error!')
                                    return res.json({downloaded: true, message: 'Inventory file not updated!', e: err});
                                })
                            })
                        }

                    })
                })
                c.connect(config)
            }
        })
        .catch((error) => {
            console.log(error);
            return res.json({test: 'Not found', error: error});
        });
}

function parse(destinationFile, customer, feedProvider, res) {
    const productPropsTypes = {
        number: 'number',
        date: 'date',
        other: 'other',
        string: 'string',
        enum: 'enum'
    };

    const productPropsMeta = {
        body: {id: 'body', type: productPropsTypes.string},
        color: {id: 'color', type: productPropsTypes.string},
        condition: {id: 'condition', type: productPropsTypes.string}, // enum, enum: {New: 'New', Used: 'Used'}},
        cost: {id: 'cost', type: productPropsTypes.number},
        id: {id: 'id', type: productPropsTypes.string},
        images: {id: 'images', type: productPropsTypes.other},
        make: {id: 'make', type: productPropsTypes.string},
        model: {id: 'model', type: productPropsTypes.string},
        originDate: {id: 'originDate', type: productPropsTypes.date},
        price: {id: 'price', type: productPropsTypes.number},
        stock: {id: 'stock', type: productPropsTypes.string},
        trim: {id: 'trim', type: productPropsTypes.string},
        vin: {id: 'vin', type: productPropsTypes.string},
        year: {id: 'year', type: productPropsTypes.number}
    };

    const imageDecider = 10

    let skipCompleteDecider = true

    const results = {
        customer: customer.id,
        newProducts: 0,
        updated: 0,
        skipped: 0,
        duplicates: 0
    }

    let daysDecider = -15

    const updatedProducts = {}

    const productStatusTypes = {
        notStarted: {
            id: 'notStarted',
            name: 'Not Started'
        },
        inProgress: {
            id: 'inProgress',
            name: 'In Progress'
        },
        completed: {
            id: 'completed',
            name: 'Completed'
        }
    };

    const items = [];

    let counter = {
        success: 0,
        fail: 0,
    }

    let {accountId, dealershipName, feedProviderConfigId} = customer;
    const {defaultConfig, config} = feedProvider;
    const selectedConfigId = feedProviderConfigId || defaultConfig;
    const {feedIdMap, productMap, papaConfig, imageSplitter} = config[selectedConfigId];

    console.log('TRYING TO PARSE')

    papa.parse(destinationFile, {
        header: true,
        dynamicTyping: true,
        step: function (row) {
            let item = row.data;
            items.push(item)
        },
        complete: async function () {
            await console.log('FILE READ');

            const last = items.length - 1
            await console.log('Customer Parsed Successfully: ', dealershipName, ' count: ', last)

            await items.shift();

            await console.log('ITEMS COUNT: ', items.length);
            await console.log('DEALERSHIP ID: ', customer.id);

            const promises = await items.map(async (item, index) => {
                const dealershipId = customer.id;

                if (item[feedIdMap.feedId] !== null) {
                    // if (item[feedIdMap.feedId].toString() === feedId) { // TODO: Why we need this??? It's from old parser
                    const vehicle = {
                        accountId,
                        dealershipId,
                        status: productStatusTypes.notStarted.id
                    }
                    await Object.keys(productMap).forEach(key => {
                        const value = item[productMap[key]]

                        if (productPropsMeta[key]) {
                            switch (productPropsMeta[key].type) {
                                case productPropsTypes.string:
                                    vehicle[key] = value ? value.toString() : value
                                    break
                                case productPropsTypes.date:
                                    vehicle[key] = moment(value).toDate()
                                    break
                                case productPropsTypes.other:
                                    break
                                default:
                                    vehicle[key] = value
                            }
                        } else {
                            vehicle[key] = value
                        }
                    })

                    const cutOffDate = moment().add(daysDecider, 'days').toDate()

                    await console.log("DEALERSHIP_ID: " + dealershipId + ", VIN AND ID: " + vehicle.id);

                    return await admin.firestore().collection('products-test')
                        .where('dealershipId', '==', dealershipId)
                        .where('vin', '==', vehicle.id)
                        .where('lastUpdate', '>=', cutOffDate)
                        .get()
                        .then(async productQuerySnapShot => {
                            if (productQuerySnapShot.size > 1) {
                                throw new Error('Multiple current products on Document')
                            } else if (productQuerySnapShot.size === 1) {
                                const product = await productQuerySnapShot.docs[0].data()
                                vehicle.id = product.id
                                vehicle.status = product.status
                                results.updated++
                            } else {
                                vehicle.id = vehicle.id + ' | ' + (new Date()).valueOf()
                                results.newProducts++
                            }

                            if (item[productMap.images]) {
                                const images = item[productMap.images];
                                let splitter = imageSplitter || '|';
                                vehicle.imageCount = images ? images.split(splitter).length : 0;

                                if (!skipCompleteDecider && vehicle.imageCount > imageDecider) {
                                    vehicle.status = 'skipped'
                                    results.skipped++
                                }
                            }

                            vehicle.lastUpdate = new Date()

                            if (!updatedProducts[vehicle.id]) {
                                updatedProducts[vehicle.id] = true

                                console.log("VEHICLE: ", vehicle.id, vehicle.model);

                                await admin.firestore().collection('products-test')
                                    .doc(vehicle.id)
                                    .set(vehicle, {merge: true})
                                    .then(props => {
                                        console.log('Updated Product: ', vehicle.id)
                                        counter.success++
                                    })
                                    .catch(error => {
                                        counter.fail++
                                        console.log('Error updating customer product: ', vehicle.id, error)
                                    })
                            } else {
                                results.duplicates++
                                console.log('Duplicate item: ', vehicle.id, vehicle.model)
                            }

                        })
                        .catch(error => {
                            counter.fail++
                            return res.json({
                                message: 'Error getting previous customer product: ' + vehicle.id,
                                error: error
                            });
                        })
                }
            })

            await Promise.all(promises).then(() => {
                console.log('After promises - Parsing data: ', counter)
                console.log('results', results)

                const now = moment().toDate();
                admin.firestore().collection('logs').doc(customer.id + '|' + now).set({
                    ...results,
                    dealershipId: customer.id,
                    createdDate: now
                })
                    .catch(err => {
                        console.log('Could not set document.');
                    })

                admin.firestore().collection('dealer_parser')
                    .where('dealership_id', '==', customer.id)
                    .where('feedFileName', '==', feedProvider.credentials.filename)
                    .where('finished', '==', false)
                    .get()
                    .then(dealer_off => {
                        dealer_off.forEach(snapShot => {
                            let data = snapShot.data();
                            data.finished = true;
                            data.notify_admin = true;
                            data.notify_client = true;
                            console.log('SET NOTIFICATION')
                            snapShot.ref.set(data);
                        });
                    })
                    .catch(err => {
                        console.log('err');
                        console.log(err);
                    })

                return res.json({
                    status: true
                });
            })
        },
        error: function (error) {
            console.log('Papa Parse Error: ', error)
        },
        ...papaConfig
    })
}
