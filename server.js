const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const { MongoClient } = require('mongodb')
const utils = require('./serverUtils.js')
const path = require('path')

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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'homepage-build', 'index.html'));
})

app.get('/options', (req, res) => {
    res.send('<html><body><h1>options page</h1></body></html>')
})

app.get('/wake', (req, res) => {
    res.send('<html><body><h1>bot is awake</h1></body></html>')
})

app.get('/useroptions', cookieParser(), async (req, res) => {
    // Get code from query string and token from cookies if present
    const code = req.query.code
    var accessToken = req.cookies['access-token'] || null
    var refreshToken = null

    // Set headers in response so CORS won't reject it
    utils.addAccess(res)

    // If user came to page via Twitch sign in and have a code, get auth tokens with the code 
    if (code) {
        const tokens = await utils.getTokensFromCode(code).catch(e => {
            return res.send(JSON.stringify({ error: e }))
        })
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
    const userInfo = await utils.getUserFromToken(accessToken)

    // Reference users collection in DB and look for signed in user
    var userRecord = await users.findOne({ twitchID: userInfo.id })

    // If user not in our DB, add them with default settings
    if (!userRecord) {
        const newUser = new utils.Person(userInfo, refreshToken)
        const chatRecordId = await db.collection('chat').insertOne(new utils.Chatlog(userInfo.login))
        newUser.chatRecordId = chatRecordId.insertedId
        await users.insertOne(newUser)

        // After adding them to DB retrieve their info from it to ensure they made it in
        userRecord = await users.findOne({ twitchID: userInfo.id })
    } else {
        if (refreshToken) {
            users.updateOne({ twitchID: userRecord.twitchID }, { $set: { refreshToken: refreshToken } })
        }
    }

    // Send response with their Twitch details and bot options
    res.send(JSON.stringify({ twitchDetails: userRecord.twitchDetails, options: userRecord.options }))
})

// Update user settings after confirming the access token in their cookies
// Makes request to twitch with the token and uses Twitch ID to query them in DB and update settings
app.post('/update', bodyParser(), async (req, res) => {
    const accessToken = req.cookies['access-token']
    utils.addAccess(res)
    if (!accessToken) {
        return res.send({ error: 'not authorized' })
    }
    const userInfo = await utils.getUserFromToken(accessToken)
    const updatedOptions = req.body
    users.updateOne({ twitchID: userInfo.id }, { '$set': { options: updatedOptions } }).then(result => {
        var { matchedCount, modifiedCount } = result
        res.send(JSON.stringify({ updated: matchedCount && modifiedCount ? true : false }))
    })
})

app.listen(process.env.PORT || 3001, () => console.log('Listening on ' + (process.env.PORT ||  '3001')))

