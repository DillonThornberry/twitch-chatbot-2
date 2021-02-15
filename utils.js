
const awardPoints = (users, amount, callback) => {
    var awardInterval = setInterval(() => {
        if (!users.length) {
            return clearInterval(awardInterval)
        }
        callback(`!add ${users.shift()} ${amount}`)
    }, 5000)
}

const rankTrivia = (triviaStats) => {
    var lb = Object.keys(triviaStats).map(player => {
        var pStats = triviaStats[player]
        return { user: player, score: (pStats.correct * 50) - ((pStats.attempts - pStats.correct) * 10) }
    })
    return lb.sort((a,b) => a.score > b.score ? -1 : 1)
}

const removeAtSign = username => username[0] === '@' || username[0] === '#' ? username.slice(1) : username

module.exports = {
    awardPoints,
    removeAtSign,
    rankTrivia
}