const WebSocket = require('ws')
const request = require('request')
const db = require('./database.js')

var channelPointsUsers = null
var callbacks = null

const connect = () => {
    // Start a pubsub WS connection with Twitch
    var ws = new WebSocket('wss://pubsub-edge.twitch.tv')

    // Once connected, load in our list of users and find out which ones use channel point rewards
    ws.on('open', async () => {    
        const users = await db.loadUsers()
        channelPointsUsers = filterChannelPointsUsers(users)
        
        // For every channel points user, get an access token, set it in memory, store the new refresh token
        // in the database, then use the access token to subscribe for channel points rewards
        for (var user in channelPointsUsers) {
            getSetStoreSub(user, channelPointsUsers).then(result => {
                console.log('getSetStoreSub completed for ' + result.username)
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

        // If channel point redemption comes in, parse information and locate user with corresponding Twitch ID
        if (message.type === 'MESSAGE' && message.data.topic.startsWith('channel-points')) {
            const redemptionInfo = parseRedemptionInfo(JSON.parse(message.data.message).data.redemption)
            const channel = Object.keys(channelPointsUsers).find(user =>
                channelPointsUsers[user].twitchID === redemptionInfo.channelId
            )
            if (redemptionInfo.title === 'Spam a message 10 times in chat') {
                if (channelPointsUsers[channel].options.spamMessage) {
                    spamMessage(channel, redemptionInfo.input || 'This channel point reward requires text input to work')
                }
            } else if (redemptionInfo.title === 'Set a secret word') {
                if (channelPointsUsers[channel].options.secretWord) {
                    callbacks.say(channel, `@${redemptionInfo.user} whisper me (Robot_Ape) your secret word. (Just the word itself with no quotations)`)
                    callbacks.awaitSecretWord(channel, redemptionInfo.user)
                }
            }
        }
    })

    // WS server must be pinged at least every 5 minutes to maintain connection
    const pingInterval = setInterval(() => {
        if (ws.readyState != 1) {
            console.log('socket closed')
            return clearInterval(pingInterval)
        }
        ws.send(JSON.stringify({
            "type": "PING"
        }))
    }, 120000)

    // Every 10 seconds we check for updated user settings from DB
    const updateInterval = setInterval(async () => {
        if (ws.readyState != 1) {
            return clearInterval(updateInterval)
        }
        const newUsers = await db.loadUsers()
        const newChannelPointsUsers = filterChannelPointsUsers(newUsers)

        // If we find a user who is new or who recently added channel point rewards, get their access token
        // and subscribe for their channel points
        for (var user in newChannelPointsUsers) {
            if (!channelPointsUsers[user]) {
                console.log('new channel points user')
                getSetStoreSub(user, newChannelPointsUsers).then(result => {
                    newChannelPointsUsers[result.username].accessToken = result.accessToken
                    channelPointsUsers[result.username] = newChannelPointsUsers[result.username]
                })
            // Otherwise just update their settings
            } else {
                channelPointsUsers[user] = newChannelPointsUsers[user]
            }
        }
    }, 10000)

    const getSetStoreSub = async (username, usersObj) => {
        const updatedUser = new Promise(async (resolve, reject) => {

            // Use refresh token in user object to get new tokens
            const refreshToken = usersObj[username].refreshToken
            if (!refreshToken) {
                return reject('no refresh token for ' + username)
            }
            const tokens = await getTokens(refreshToken, username).catch(e => {
                return reject(e)
            })

            // If tokens successfully retrieved, store new refresh token in DB
            if (!tokens || !tokens.newRefreshToken) {
                return reject('refresh token failed for ' + username)
            } else {
                console.log('Tokens successfully retrieved for ' + tokens.user)
                db.setUserRefreshToken(tokens.user, tokens.newRefreshToken)
            }
            usersObj[tokens.user].accessToken = tokens.accessToken
            const { accessToken, twitchID } = usersObj[tokens.user]

            // Sub to channel points with newly acquired access token
            subToChannelPoints(twitchID, accessToken)

            // returned value just proves action was completed
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
        console.log(twitchID + ' sent to pubsub')
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

// Filters users down to those who have channel point rewards enabled and creates channelPointsUser object
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
    const tokens = new Promise((resolve, reject) => {
        request.post({ url: getTwitchUrl(refreshToken), json: true }, (err, response) => {
            const accessToken = response.body.access_token
            const newRefreshToken = response.body.refresh_token
            if (err || !response.body) {
                return reject('Request failed for refresh => access token for ' + user)
            }
            if (!accessToken) {
                return reject('Refresh token was no good for ' + user)
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