const WebSocket = require('ws')
const request = require('request')
const { MongoClient } = require('mongodb')

const dbClient = new MongoClient(process.env.DB_URL)
var db = null
var usersColl = null

const ws = new WebSocket('wss://pubsub-edge.twitch.tv')

var channelPointsUsers = null

ws.on('open', async () => {
    await dbClient.connect()
    db = dbClient.db('chatbot-db')
    usersColl = db.collection('users')
    const users = await require('./app.js').loadUsers()
    channelPointsUsers = filterChannelPointsUsers(users)
    for (var user in channelPointsUsers) {
        await setUserAccessToken(user)
        const { accessToken, twitchID } = channelPointsUsers[user]
        const opts = {
            type: 'LISTEN',
            data: {
                topics: [`channel-points-channel-v1.${twitchID}`],
                'auth_token': accessToken
            }
        }
        ws.send(JSON.stringify(opts))
    }
})

ws.on('message', (message) => {
    message = JSON.parse(message)
    if (message.type === 'MESSAGE' && message.data.topic.startsWith('channel-points')) {
        const redemptionInfo = JSON.parse(message.data.message).data.redemption
        const channel = Object.keys(channelPointsUsers).find(user =>
            channelPointsUsers[user].twitchID === redemptionInfo.channel_id
        )
        const user = redemptionInfo.user.login
        const input = redemptionInfo.user_input
        const title = redemptionInfo.reward.title
        if (title === 'Spam a message 10 times in chat') {
            spamMessage(user, input)
        } else if (title === 'Set a secret word') {
            console.log('secret word redeemed')
            const say = require('./app.js').say
            say(channel, `@${user} whisper me your secret word`)
            require('./app.js').awaitSecretWord(channel, user)
        }
    }
})

const spamMessage = (user, input) => {
    for (var i = 0; i < 10; i++) {
        require('./app.js').say(user, input)
    }
}

const filterChannelPointsUsers = users => {
    const channelPointsUsers = {}
    for (var user in users) {
        if ((users[user].options.secretWord || users[user].options.spamMessage) && !channelPointsUsers[user]) {
            channelPointsUsers[user] = {
                options: {
                    secretWord: users[user].options.secretWord,
                    spamMessage: users[user].options.spamMessage
                },
                refreshToken: users[user].refreshToken,
                twitchID: users[user].twitchID
            }
        }
    }
    return channelPointsUsers
}

const getTokens = async (refreshToken) => {
    const tokens = new Promise((resolve, reject) => {
        request.post({ url: getTwitchUrl(refreshToken), json: true }, (err, response) => {
            const accessToken = response.body.access_token
            const newRefreshToken = response.body.refresh_token
            resolve({ accessToken, newRefreshToken })
        })
    })
    return await tokens
}

const setUserAccessToken = async (user) => {
    const finished = new Promise((resolve, reject) => {
        const { refreshToken } = channelPointsUsers[user]
        getTokens(refreshToken).then(tokens => {
            channelPointsUsers[user].accessToken = tokens.accessToken
            usersColl.updateOne({ 'twitchDetails.login': user }, { $set: { refreshToken: tokens.newRefreshToken } })
                .then(() => {
                    resolve()
                })
        })
    })
    return await finished
}

const getTwitchUrl = refreshToken => `https://id.twitch.tv/oauth2/token?client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}&grant_type=refresh_token&refresh_token=${refreshToken}`

setInterval(() => {
    ws.send(JSON.stringify({
        "type": "PING"
    }))
}, 120000)