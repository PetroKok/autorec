/**
 * Copied from old parser.
 **/
const {Dealership, Product} = require('../models')
const {Db, admin} = require('../firebase/firebase')
const {getDealershipBy} = require('../controllers/parseController')
const moment = require('moment')
const _ = require('lodash')

const service = function (res) {
    getCustomerList()
        .then(async customers => {
            console.log(_.map(customers, (item) => {
                return {id: item.id, feedProviderId: item.feedProviderId}
            }));

            const inventoryData = await filterBeforeUpdatingInventory(Object.values(customers))
            const result = await updateInventory(inventoryData.map((customer => customer.id)), res)

            if (result && result.status === true) {
                console.log(result)
            }
        })
    res.send({started: true});
}

function getCustomerList() {
    return Dealership.ref().where('active', '==', true).get()
        .then(querySnapshot => {
            return Db.getDataFromQuerySnapshot(querySnapshot)
        })
}

function filterBeforeUpdatingInventory(customers) {
    return customers.filter(customer => {
        return !!customer.feedProviderId && customer.feedFileName && customer.feedFileName.trim() !== '' && customer.feedFileName.trim() !== undefined;
    })
}

async function updateInventory(customerIds, res) {
    const promises = await customerIds.map(async customerId => {
        let daysDecider = -15
        const cutOffDate = moment().add(daysDecider, 'days').toDate()

        // update user created products
        const userCreatedDaysDecider = -100
        const userCreatedCutOffDate = moment().add(userCreatedDaysDecider, 'days').toDate()
        await Product.ref()
            .where('dealershipId', '==', customerId)
            .where('userDateCreated', '>=', userCreatedCutOffDate)
            .get()
            .then(querySnapshot => {
                const data = Db.getDataFromQuerySnapshot(querySnapshot)
                // console.log('customer: ', customerId, ' created inventory: ', Object.keys(data).length)

                const batch = admin.firestore().batch()
                const now = new Date
                Object.values(data).forEach(product => {
                    const ref = Product.ref().doc(product.id)
                    batch.update(ref, {lastUpdate: now})
                })

                batch.commit().then(() => {/*console.log('Batch finished')*/});
            })

        console.log('$$$ >>> ', customerId);
        return await getDealershipBy(customerId, res, true)
    })

    return await Promise.all(promises)
}

module.exports = {service}