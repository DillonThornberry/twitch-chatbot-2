const WebSocket = require('ws')
const request = require('request')
const db = require('./database.js')

var channelPointsUsers = null
var callbacks = null

const connect = () => {
    var ws = new WebSocket('wss://pubsub-edge.twitch.tv')
    ws.on('open', async () => {
        const users = await db.loadUsers()
        channelPointsUsers = filterChannelPointsUsers(users)
        for (var user in channelPointsUsers) {
            const refreshToken = channelPointsUsers[user].refreshToken
            getTokens(refreshToken).then(tokens => {
                db.setUserRefreshToken(user, tokens.newRefreshToken)
                channelPointsUsers[user].accessToken = tokens.accessToken
                const { accessToken, twitchID } = channelPointsUsers[user]
                const opts = getSubOpts(twitchID, accessToken)
                console.log(opts)
                ws.send(JSON.stringify(opts))
            })
        }
    })

    ws.on('message', (message) => {
        console.log(message)
        if (message.type === 'RECONNECT') {
            console.log('reconnecting')
            return connect()
        }
        message = JSON.parse(message)
        if (message.type === 'MESSAGE' && message.data.topic.startsWith('channel-points')) {
            const redemptionInfo = parseRedemptionInfo(JSON.parse(message.data.message).data.redemption)
            const channel = Object.keys(channelPointsUsers).find(user =>
                channelPointsUsers[user].twitchID === redemptionInfo.channelId
            )
            if (redemptionInfo.title === 'Spam a message 10 times in chat') {
                spamMessage(redemptionInfo.user, redemptionInfo.input)
            } else if (redemptionInfo.title === 'Set a secret word') {
                callbacks.say(channel, `@${redemptionInfo.user} whisper me your secret word`)
                callbacks.awaitSecretWord(channel, redemptionInfo.user)
            }
        }
    })

    setInterval(() => {
        ws.send(JSON.stringify({
            "type": "PING"
        }))
    }, 120000)

}

const spamMessage = (user, input) => {
    for (var i = 0; i < 10; i++) {
        callbacks.say(user, input)
    }
}

const parseRedemptionInfo = redemptionInfo => {
    return {
        user: redemptionInfo.user.login,
        input: redemptionInfo.user_input,
        title: redemptionInfo.reward.title,
        channelId: redemptionInfo.channel_id
    }
}

const getSubOpts = (twitchID, accessToken) => {
    return {
        type: 'LISTEN',
        data: {
            topics: [`channel-points-channel-v1.${twitchID}`],
            'auth_token': accessToken
        }
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

const getTwitchUrl = refreshToken => `https://id.twitch.tv/oauth2/token?client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}&grant_type=refresh_token&refresh_token=${refreshToken}`

connect()

module.exports = {
    setCallbacks: callbacksObj => callbacks = { ...callbacksObj }
}