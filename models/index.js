const {Db} = require('../firebase/firebase')
const moment = require('moment')

const defaultDaysDecider = -10

const functions = {
  deleteDoc: {id: 'deleteDoc'}
}

class Base {

  static generateModel (collection) {
    return {
      deleteDoc: Base.generateDeleteDoc(collection),
      setDoc: Base.generateSetDoc(collection),
      getDoc: Base.generateGetDoc(collection),
      ref: Base.generateRef(collection),
      updateDoc: Base.generateUpdateDoc(collection)
    }
  }

  static generateFunction (collection, name) {


    switch(name) {
      case Base.functions.deleteDoc.id:
        return function deleteDocFunction (doc) {
          return Db.deleteDoc(collection, doc)
        }
    }
  }

  static generateDeleteDoc (collection) {
    return function deleteDocFunction (doc) {
      return Db.deleteDoc(collection, doc)
    }
  }

  static generateSetDoc (collection) {
    return function setDocFunction (doc, props) {
      return Db.setDoc(collection, doc, props)
    }
  }

  static generateUpdateDoc (collection) {
    return function updateDocFunction (doc, props) {
      return Db.updateDoc(collection, doc, props)
    }
  }

  static generateGetDoc (collection) {
    return function getDocFunction (doc, props) {
      return Db.getDoc(collection, doc, props)
    }
  }

  static generateGetDataFromQuery (collection) {
    return function getDataFromQueryFunction (ref) {
      return Db.getDataFromQuery(ref)
    }
  }

  static generateRef (collection) {
    return function refFunction () {
      return Db.ref(collection)
    }
  }
}

const models = {
  Account: {
    collection: 'accounts',
    id: 'Account'
  },
  User: {
    collection: 'users',
    id: 'User'
  },
  Dealership: {
    collection: 'dealerships',
    id: 'Dealership'
  },
  Product: {
    collection: 'products',
    id: 'Product',
    queryCurrentProducts: function queryCurrentProducts (field, value, daysDecider, dealershipId) {
      let decider = daysDecider || defaultDaysDecider
      const cutOffDate = moment().add(decider, 'days').toDate()
      return Db.ref('products')
        .where('dealershipId', '==', dealershipId)
        .where(field, '==', value)
        .where('lastUpdate', '>=', cutOffDate).get()
    },
    getCurrentProducts: (productId, daysDecider) => {
      return models.Product.queryCurrentProducts('vin', productId, daysDecider)
    },
    fetchProducts (customerId, daysDecider = defaultDaysDecider) {
      const cutOffDate = moment().add(daysDecider, 'days').toDate()

      return Db.ref('products')
        .where('dealershipId', '==', customerId)
        .where('lastUpdate', '>=', cutOffDate)
        .get()
    },
    fetchProductsFromIds (customerIds, dayDecider = defaultDaysDecider) {
      return Promise.all(customerIds.map(customerId => {
        return models.Product.fetchProducts(customerId, dayDecider)
          .then(querySnapshot => {
            return Db.getDataFromQuerySnapshot(querySnapshot)
          })
      }))
    }
  },
  FeedProviders: {
    collection: 'feedProviders',
    id: 'FeedProviders',
  },
  Test: {
    collection: 'test',
    id: 'Test'
  },
  Logs: {
    collection: 'logs',
    id: 'Logs'
  }
}

Object.values(models).forEach((modelInfo => {
  models[modelInfo.id] = Object.assign(
    modelInfo,
    Base.generateModel(modelInfo.collection)
  )
}))

module.exports = models