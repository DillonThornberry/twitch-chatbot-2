
const awardPoints = (users, amount, callback) => {
    var awardInterval = setInterval(() => {
        if (!users.length) {
            return clearInterval(awardInterval)
        }
        callback(`!add ${users.shift()} ${amount}`)
    }, 5000)
}

const removeAtSign = username => username[0] === '@' || username[0] === '#' ? username.slice(1) : username

module.exports = {
    awardPoints,
    removeAtSign,
}