const firebase_admin = require('firebase-admin');

const firebase = firebase_admin.initializeApp({
    credential: firebase_admin.credential.cert({
        apiKey: process.env.APIKEY,
        authDomain: process.env.AUTHDOMAIN,
        databaseURL: process.env.DATABASEURL,
        project_id: process.env.PROJECTID,
        storageBucket: process.env.STORAGEBUCKET,
        messagingSenderId: process.env.MESSAGINGSENDERID,
        type: process.env.TYPE,
        private_key_id: process.env.PRIVATE_KEY_ID,
        private_key: process.env.PRIVATE_KEY,
        client_email: process.env.CLIENT_EMAIL,
        client_id: process.env.CLIENT_ID,
        auth_uri: process.env.AUTH_URI,
        token_uri: process.env.TOKEN_URI,
        auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
        client_x509_cert_url: process.env.CLIENT_X509_CERT_URL
    }),
    databaseURL: process.env.DATABASEURL
});
const admin = firebase;
exports.admin = firebase;


exports.storage = firebase.storage().bucket('stationz-c5b0b');

class Db {
    static async updateDoc(collection, doc, info) {
        const docRef = firebase.firestore().collection(collection).doc(doc)

        return docRef.update(info)
    }

    static setDoc(collection, doc, info) {
        const docRef = firebase.firestore().collection(collection).doc(doc)

        return docRef.set(info)
            .catch(handleCatch('Could not set document: ' + doc))
    }

    static deleteDoc(collection, doc) {
        return firebase.firestore().collection(collection).doc(doc).delete()
            .catch(handleCatch('Could not delete document: ' + doc))
    }

    static async getDoc(collection, doc) {
        const docRef = firebase.firestore().collection(collection).doc(doc)
        return docRef.get()
            .catch(handleCatch('Could not get document: ' + doc))
    }

    static ref (collection) {
        return firebase.firestore().collection(collection)
    }

    static getCurrentProducts (id, dealershipId) {
        let daysDecider = -15
        const cutOffDate = moment().add(daysDecider, 'days').toDate()
        return Db.ref('products')
            .where('dealershipId', '==', dealershipId)
            .where('vin', '==', id)
            .where('lastUpdate', '>=', cutOffDate).get()
    }

    static getDataFromQuery (ref) {
        return new Promise(resolve => {
            ref.get()
                .then(querySnapshot => {
                    const data = Db.getDataFromQuerySnapshot(querySnapshot)
                    resolve(data)
                })
                .catch(handleCatch('Failed receive data from collection'))
        })
    }

    static getDataFromQuerySnapshot (snapshot) {
        const data = {}
        snapshot.forEach(snapShot => {
            const item = snapShot.data()
            let id = snapShot.id
            data[id] = item
        })
        return data
    }

}

module.exports = {
    Db,
    admin
}