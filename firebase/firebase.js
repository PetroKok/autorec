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

exports.admin = firebase;


exports.storage = firebase.storage().bucket('stationz-c5b0b');