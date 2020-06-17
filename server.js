const express = require('express')
const request = require('request')
const cookieParser = require('cookie-parser')
require('dotenv').config()

const app = express()

app.use(cookieParser())

app.get('/useroptions', async (req, res) => {
    // Get code from query string and token from cookies if present
    const code = req.query.code
    var accessToken = req.cookies['access-token'] || null

    // Set headers in response so CORS won't reject it
    addAccess(res)

    // If user came to page via Twitch sign in and have a code, get auth tokens with the code 
    if (code) {
        const tokens = await getTokensFromCode(code)
        accessToken = tokens.accessToken
        if (accessToken) {
            res.cookie('access-token', accessToken, { maxAge: 360 * 3 * 1000 })
        }
    }
    // If no code or code failed, and none was in cookies, return with error response
    if (!accessToken) {
        return res.send(JSON.stringify({ error: 'no log-in credentials' }))
    }

    // Get the users info with the access token we received
    const userInfo = await getUserFromToken(accessToken)

    // At this point see if user is in our database (via twitch ID)
    // If so, get their options and send back
    // If not, add them to database with twitch info, refresh token, and default options
    // If no refresh token send login error
    console.log('after all awaits: ')
    console.log(userInfo)
    res.send(JSON.stringify(userInfo))
})

// Second path PUT /update will update user settings after confirming the access token in their cookies
// It will make a request to twitch with the token and use Twitch ID to query them in DB and update 
app.put('/update', async (req, res) => {
    const accessToken = req.cookies['access-token']
    if (!accessToken) {
        return res.send({ error: 'not authorized' })
    }
    const userInfo = await getUserFromToken(accessToken)
})

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
    res.append('Access-Control-Allow-Origin', 'http://localhost:3002');
    res.append('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.append('Access-Control-Allow-Headers', 'Content-Type, credentials');
    res.append('Access-Control-Allow-Credentials', 'true');
}

app.listen(3001, () => console.log('listening on 3001'))

