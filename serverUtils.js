const request = require('request')

const defaultOptions = {
    history: true, trivia: true, slots: true, atRobotApe: true, awardPoints: false, recordChat: true,
    secretWord: false, spamMessage: false,
}

// Sets response headers so CORS won't block
const addAccess = res => {
    // res.append('Access-Control-Allow-Origin', 'http://localhost:3002');
    res.append('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.append('Access-Control-Allow-Headers', 'Content-Type, credentials');
    //res.append('Access-Control-Allow-Credentials', true);
}

// Gets Twitch auth token via sign-in code
const getTokensFromCode = async (code) => {
    const codeUrl = `https://id.twitch.tv/oauth2/token?client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=http://localhost:3002`
    const tokens = new Promise((resolve, reject) => {
        request.post({ url: codeUrl, json: true }, (error, response) => {
            const accessToken = response.body.access_token
            const refreshToken = response.body.refresh_token
            if (error || !response.body) {
                return reject('no response from code -> token request')
            }
            if (!response.body.refresh_token) {
                return reject('code failed to obtain access/refesh tokens')
            }
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

class Chatlog {
    constructor(twitchName) {
        this.twitchName = twitchName
        this.chatlog = []
    }
}

class Person {
    constructor(twitchDetails, refreshToken) {
        this.twitchID = twitchDetails.id
        this.chatRecordId = null
        this.twitchDetails = twitchDetails
        this.refreshToken = refreshToken
        this.options = defaultOptions
        this.secretWords = {}
        this.leaderboard = []
    }
}

module.exports = {
    addAccess,
    getTokensFromCode,
    getUserFromToken,
    Chatlog,
    Person
}