const express = require('express')
const request = require('request')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const { MongoClient } = require('mongodb')
require('dotenv').config()
require('./app.js')

const client = new MongoClient(process.env.DB_URL)
var db = null
var users = null
client.connect().then(() => {
    console.log('connected to DB')
    db = client.db('chatbot-db')
    users = db.collection('users')
})

const app = express()

app.use(cookieParser())
app.use(bodyParser())
app.use(cors({ origin: 'http://localhost:3002', credentials: true }))

app.get('/useroptions', cookieParser(), async (req, res) => {
    // Get code from query string and token from cookies if present
    const code = req.query.code
    var accessToken = req.cookies['access-token'] || null
    var refreshToken = null

    // Set headers in response so CORS won't reject it
    addAccess(res)

    // If user came to page via Twitch sign in and have a code, get auth tokens with the code 
    if (code) {
        const tokens = await getTokensFromCode(code)
        newAccessToken = tokens.accessToken
        refreshToken = tokens.refreshToken
        if (newAccessToken) {
            res.cookie('access-token', newAccessToken, { maxAge: 3600 * 3 * 1000, path: '/' })
            accessToken = newAccessToken
        }
    }
    // If no code or code failed, and none was in cookies, return with error response
    if (!accessToken) {
        return res.send(JSON.stringify({ error: 'no log-in credentials' }))
    }

    // Get the users info with the access token we received
    const userInfo = await getUserFromToken(accessToken)

    // Reference users collection in DB and look for signed in user
    var userRecord = await users.findOne({ twitchID: userInfo.id })

    // If user not in our DB, add them with default settings
    if (!userRecord) {
        const newUser = new Person(userInfo, refreshToken)
        const chatRecordId = await db.collection('chat').insertOne(new Chatlog(userInfo.login))
        newUser.chatRecordId = chatRecordId.insertedId
        await users.insertOne(newUser)


        // After adding them to DB retrieve their info from it to ensure they made it in
        userRecord = await users.findOne({ twitchID: userInfo.id })
    } else {
        users.updateOne({ __id: userRecord.__id }, { $set: { refreshToken: refreshToken } })
    }

    // Send response with their Twitch details and bot options
    res.send(JSON.stringify({ twitchDetails: userRecord.twitchDetails, options: userRecord.options }))
})

// Update user settings after confirming the access token in their cookies
// Makes request to twitch with the token and uses Twitch ID to query them in DB and update settings
app.post('/update', bodyParser(), async (req, res) => {
    const accessToken = req.cookies['access-token']
    addAccess(res)
    if (!accessToken) {
        return res.send({ error: 'not authorized' })
    }
    const userInfo = await getUserFromToken(accessToken)
    const updatedOptions = req.body
    users.updateOne({ twitchID: userInfo.id }, { '$set': { options: updatedOptions } }).then(result => {
        var { matchedCount, modifiedCount } = result
        res.send(JSON.stringify({ status: matchedCount && modifiedCount ? 'update successful' : 'no updates made' }))
    })
})

// Functions below will probably be moved to utils/serverUtils.js 

// Gets Twitch auth token via sign-in code
const getTokensFromCode = async (code) => {
    const codeUrl = `https://id.twitch.tv/oauth2/token?client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=http://localhost:3002`
    const tokens = new Promise((resolve, reject) => {
        request.post({ url: codeUrl, json: true }, (error, response) => {
            const accessToken = response.body.access_token
            const refreshToken = response.body.refresh_token
            resolve({ accessToken, refreshToken })
        })
    })
    return await tokens
}

// Get user's twitch info with auth token
const getUserFromToken = async (accessToken) => {
    const userInfo = new Promise((resolve, reject) => {
        request.get({
            url: `https://api.twitch.tv/helix/users`, json: true,
            headers: {
                "Client-ID": process.env.CLIENT_ID,
                Authorization: `Bearer ${accessToken}`
            }
        }, (err, response) => {
            resolve(response.body.data[0])
        })
    })
    return await userInfo
}

// Sets response headers so CORS won't block
const addAccess = res => {
    // res.append('Access-Control-Allow-Origin', 'http://localhost:3002');
    res.append('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.append('Access-Control-Allow-Headers', 'Content-Type, credentials');
    //res.append('Access-Control-Allow-Credentials', true);
}

const defaultOptions = {
    history: true, trivia: true, slots: true, atRobotApe: true, awardPoints: false, recordChat: true,
    secretWord: false, spamMessage: false,
}

class Person {
    constructor(twitchDetails, refreshToken) {
        this.twitchID = twitchDetails.id
        this.chatRecordId = null
        this.twitchDetails = twitchDetails
        this.refreshToken = refreshToken
        this.options = defaultOptions
        this.secretWords = {}
    }
}

class Chatlog {
    constructor(twitchName) {
        this.twitchName = twitchName
        this.chatlog = []
    }
}

app.listen(3001, () => console.log('Listening on 3001'))

