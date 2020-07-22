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
            getSetStoreSub(user, channelPointsUsers).then(result => {
                console.log('result of getSetStoreSub')
                console.log(result)
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
                if (channelPointsUsers[channel].options.spamMessage) {
                    spamMessage(channel, redemptionInfo.input)
                }
            } else if (redemptionInfo.title === 'Set a secret word') {
                if (channelPointsUsers[channel].options.secretWord) {
                    callbacks.say(channel, `@${redemptionInfo.user} whisper me (Robot_Ape) your secret word. (Just the word itself with no quotations)`)
                    callbacks.awaitSecretWord(channel, redemptionInfo.user)
                }
            }
        }
    })

    const pingInterval = setInterval(() => {
        if (ws.readyState != 1) {
            console.log('socket closed')
            return clearInterval(pingInterval)
        }
        ws.send(JSON.stringify({
            "type": "PING"
        }))
    }, 120000)

    const updateInterval = setInterval(async () => {
        if (ws.readyState != 1) {
            return clearInterval(updateInterval)
        }
        const newUsers = await db.loadUsers()
        const newChannelPointsUsers = filterChannelPointsUsers(newUsers)
        for (var user in newChannelPointsUsers) {
            if (!channelPointsUsers[user]) {
                console.log('new channel points user')
                getSetStoreSub(user, newChannelPointsUsers).then(result => {
                    newChannelPointsUsers[result.username].accessToken = result.accessToken
                    channelPointsUsers[result.username] = newChannelPointsUsers[result.username]
                })
            } else {
                channelPointsUsers[user] = newChannelPointsUsers[user]
            }
        }
    }, 10000)

    const getSetStoreSub = async (username, usersObj) => {
        const updatedUser = new Promise(async (resolve, reject) => {
            const refreshToken = usersObj[username].refreshToken
            if (!refreshToken) {
                return reject('no refresh token for ' + username)
            }
            const tokens = await getTokens(refreshToken, username).catch(e => {
                return reject(e)
            })
            if (!tokens.newRefreshToken) {
                return reject('refresh token failed')
            } else {
                console.log('options passed to db.setUserRefreshToken: ')
                console.log('user: ' + tokens.user)
                console.log('rf token: ' + tokens.newRefreshToken)
                db.setUserRefreshToken(tokens.user, tokens.newRefreshToken)
            }
            usersObj[tokens.user].accessToken = tokens.accessToken
            console.log('usersObj (from getSetStoreSub)')
            console.log(usersObj)
            const { accessToken, twitchID } = usersObj[tokens.user]
            subToChannelPoints(twitchID, accessToken)
            resolve({ username, accessToken: tokens.accessToken })
        })
        return await updatedUser
    }

    const subToChannelPoints = (twitchID, accessToken) => {
        const opts = {
            type: 'LISTEN',
            data: {
                topics: [`channel-points-channel-v1.${twitchID}`],
                'auth_token': accessToken
            }
        }
        console.log('Options being sent to pub sub:')
        console.log(opts)
        ws.send(JSON.stringify(opts))
    }

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

const getTokens = async (refreshToken, user) => {
    console.log('from getTokens')
    console.log(user)
    const tokens = new Promise((resolve, reject) => {
        request.post({ url: getTwitchUrl(refreshToken), json: true }, (err, response) => {
            console.log(user + '------------')
            console.log(response.body)
            console.log('-------------')
            const accessToken = response.body.access_token
            const newRefreshToken = response.body.refresh_token
            if (err || !response.body) {
                return reject('Request failed for refresh => access token')
            }
            if (!accessToken) {
                return reject('Refresh token was no good')
            }
            resolve({ accessToken, newRefreshToken, user })
        })
    })
    return await tokens
}

const getTwitchUrl = refreshToken => `https://id.twitch.tv/oauth2/token?client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}&grant_type=refresh_token&refresh_token=${refreshToken}`

connect()

module.exports = {
    setCallbacks: callbacksObj => callbacks = { ...callbacksObj }
}