const {admin} = require('../firebase/firebase');
const Client = require('ftp');
const moment = require('moment');
const papa = require('papaparse');
const fs = require('fs');

exports.getDealershipBy = function (dealer_id, res, boolRes = false) {
    let customer = {};
    let feedProvider = {};

    return admin.firestore().collection('dealerships')
        .where('id', '==', dealer_id).limit(1).get()
        .then(async dealer => {
            let data = [];

            await dealer.forEach(snapShot => {
                const item = snapShot.data()
                data[item.id] = item
            })

            const {feedProviderId} = data[dealer_id];
            customer = data[dealer_id];

            return admin.firestore().collection('feedProviders').doc(feedProviderId).get();
        })
        .then(async feedProviderSnapShot => {

            feedProvider = await feedProviderSnapShot.data()


            if (feedProvider === undefined || feedProvider.credentials === undefined || feedProvider.config === undefined) {
                const message = {
                    status: false,
                    message: 'Feed provider or credentials for feed provider is not provided!'
                };
                return boolRes ? message : res.json(message);
            }


            let {feedProviderConfigId} = customer;
            let {defaultConfig} = feedProvider;
            const selectedConfigId = feedProviderConfigId || defaultConfig;
            if (feedProvider.config[selectedConfigId] === undefined) {
                const message = {
                    status: false,
                    message: 'Config is not correct!'
                };
                return boolRes ? message : res.json(message);
            }


            const needFeedId = feedProvider.feedId;
            if (needFeedId && (customer.feedId === undefined || customer.feedId === null || customer.feedId === '')) {
                console.log({feedId: true, message: 'Dealer must provide dealer id!'})
                const message = {status: true, message: 'Dealer must provide dealer id!'};
                return boolRes ? message : res.json(message);
            }


            const feedFileName = customer.feedFileName;

            const folder = feedProvider.credentials.folder;

            let serverFilePath = folder + feedFileName

            let config = {
                host: feedProvider.credentials.host,
                user: feedProvider.credentials.username,
                password: feedProvider.credentials.password,
                port: feedProvider.credentials.port || 21,
            }

            downloadFeed();

            function downloadFeed() {
                var c = new Client()

                c.once('ready', function () {
                    console.log('Ready to connect to FTP!');

                    c.lastMod(serverFilePath, function (err, date) {
                        if (err && err.code === 550) {
                            console.log('File not exists on FTP!')
                            const message = {status: false, message: 'File not exists on FTP!', e: err};
                            return boolRes ? message : res.json(message);
                        }

                        const serverModifiedDate = moment(date)
                        const serverCutoffDate = moment().add(-4, 'hours')

                        console.log(`Last modified! ${serverFilePath} >>>`, date, new Date())
                        const localPath = 'feeds/' + feedFileName;

                        var stats;
                        if (fs.existsSync(localPath)) {
                            stats = fs.statSync(localPath);
                        }

                        if (serverModifiedDate.isBefore(serverCutoffDate)) {
                            console.log('Inventory file not updated!');
                            if (fs.existsSync(localPath)) {
                                return parse(fs.createReadStream(localPath), customer, feedProvider, res, boolRes);
                            }
                            const message = {status: false, message: 'Inventory file not updated!', e: err};
                            return boolRes ? message : res.json(message);
                        } else {
                            c.get(serverFilePath, function (err, stream) {
                                if (err) throw err;
                                console.log('Reading file!');
                                console.log(`From ${serverFilePath} to ${localPath}`);
                                stream.pipe(fs.createWriteStream(localPath))

                                stream.on('finish', function () {
                                    console.log('Store file!');
                                    c.end()
                                    return parse(fs.createReadStream(localPath), customer, feedProvider, res, boolRes);
                                })

                                stream.once('close', function () {
                                    c.end();
                                });
                                stream.on('error', function (err) {
                                    console.log('Stream error!', err)
                                    deleteProcess(customer, feedProvider);
                                    const message = {status: true, message: 'Inventory file not updated!', e: err};
                                    return boolRes ? message : res.json(message);
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
            deleteProcess(customer, feedProvider);
            const message = {status: false, message: 'Dealership not found!'};
            return boolRes ? message : res.json(message);
        });
}

function parse(destinationFile, customer, feedProvider, res, boolRes) {
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

    let {feedId, accountId, feedProviderConfigId} = customer;
    const {defaultConfig, config,} = feedProvider;
    const needFeedId = feedProvider.feedId;
    const selectedConfigId = feedProviderConfigId || defaultConfig;
    const {feedIdMap, productMap, papaConfig, imageSplitter} = config[selectedConfigId];

    console.log('TRYING TO PARSE FOR: ', feedId)

    return papa.parse(destinationFile, {
        header: true,
        dynamicTyping: true,
        step: function (row) {
            let item = row.data;
            items.push(item)
        },
        complete: async function () {
            const last = items.length - 1

            await items.shift();

            await console.log('________________________: ');
            await console.log('ITEMS COUNT: ', items.length);
            await console.log('DEALERSHIP ID: ', customer.id);

            const promises = await items.map(async (item, index) => {
                const dealershipId = customer.id;
                if ((needFeedId === true && item[feedIdMap.feedId] !== undefined && item[feedIdMap.feedId].toString() === feedId) || needFeedId === false) {
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
                                    vehicle[key] = value
                                    const date = moment(value);
                                    if (date.isValid()) {
                                        vehicle[key] = moment(value).toDate()
                                    }
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

                    return await admin.firestore().collection('products')
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

                                await admin.firestore().collection('products')
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
                            console.log(error);
                            deleteProcess(customer, feedProvider);
                            const message = {
                                status: false,
                                message: 'Error getting previous customer product: ' + vehicle.id,
                                error: error
                            };
                            return boolRes ? message : res.json(message);
                        })
                }
            })

            return await Promise.all(promises).then(() => {
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

                deleteProcess(customer, feedProvider);

                const message = {
                    status: true
                };
                return boolRes ? message : res.json(message);
            })
        },
        error: function (error) {
            console.log('Papa Parse Error: ', error)
            deleteProcess(customer, feedProvider);
        },
        ...papaConfig
    })
}

function deleteProcess(customer, feedProvider) {
    // admin.firestore().collection('dealer_parser')
    //     .where('dealership_id', '==', customer.id)
    //     .where('feedFileName', '==', feedProvider.credentials.filename)
    //     .where('finished', '==', false)
    //     .get()
    //     .then(dealer_off => {
    //         dealer_off.forEach(snapShot => {
    //             snapShot.ref.delete();
    //         });
    //     })
    //     .catch(err => {
    //         console.log('err');
    //         console.log(err);
    //     })
}