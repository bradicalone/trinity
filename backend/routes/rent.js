require('dotenv').config();
const express = require('express');
const router = express.Router();
const controller = require('../spartanBot');
const request = require('request');
const events = require('events');
const mongoose = require('mongoose');
const User = require('../models/user');
const emitter = new events()
const wss = require('./socket').wss;
const bip32 = require('bip32');
const { Account, Networks, Address } = require('@oipwg/hdmw');

const Rent = async (token, percent) => {
    if (token === "FLO") {
        return await new Promise((resolve, reject) => {
            request({url: 'https://livenet.flocha.in/api/status?q=getInfos'}, (err, res, body)=> {
                if (err) {
                    reject( err )
                }
                let data = JSON.parse(body)
                let difficulty = data.info.difficulty
                let hashrate = difficulty * Math.pow(2, 32) / 40
                let Networkhashrate = hashrate / 1000000000000;  // TH/s
                let Rent = Networkhashrate * (-percent / (-1 + percent)) // * 1000000 for MRR to MH/s
                let MinPercentFromMinHashrate = 1000000000000 * .01 / ( ( difficulty * Math.pow(2, 32) / 40 ) + (1000000000000 * .01) )
                resolve( {Rent, MinPercentFromMinHashrate, difficulty, Networkhashrate } )
            })
        })
    }
   
    if (token === "RVN") {
        return await new Promise((resolve, reject) => {
            request({ url: 'https://rvn.2miners.com/api/stats' }, (err, res, body) => {
                if (err) {
                    reject( err ) 
                }
                let data = JSON.parse(body);
                let difficulty = data.nodes[0].difficulty;
                let hashrate = difficulty * Math.pow(2, 32) / 60;
                let Networkhashrate = hashrate / 1000000000000; // TH/s
                let Rent = Networkhashrate * (-percent / (-1 + percent))   // * 1000000 for MRR to MH/s
                let MinPercentFromMinHashrate = 1000000000000 * .01 / ( ( difficulty * Math.pow(2, 32) / 40 ) + (1000000000000 * .01) )
                resolve( {Rent, MinPercentFromMinHashrate, difficulty, Networkhashrate } )
            })
        })
    }
}

async function processUserInput(req, res) {
    let options = req.body
    let {profitReinvestment, updateUnsold, dailyBudget, autoRent, spot, alwaysMineXPercent,
        autoTrade, morphie, supportedExchange, profile_id, Xpercent, userId, token} = options;

    try {
        const rent = await Rent(token, Xpercent/100) 
        let user = await User.findById({ _id: userId})

        // User.findOneAndUpdate({'profiles._id': '5eac4e09e40612427b2e8531'},{profiles}, {new: true}, (err, data)=> {
        //     if(err) console.log('err', err)
        //     console.log('data', data)
        // })

       console.log( 'options', options)
        let getAddress = (index, xPub, token, usedIndexes) => {
            const EXTERNAL_CHAIN = 0
            const currency = token === "RVN" ? 'raven' : token.toLowerCase()

            if(usedIndexes.length) {
                for(let i = 0; i < usedIndexes.length; i++) {
                    if( usedIndexes[i] === index) index++
                }
            }
            console.log('index in function',index)
            const paymentRecieverAddressGenerator = new Account(bip32.fromBase58(xPub, Networks[currency].network), Networks[currency], false)
            let usedAddresses = paymentRecieverAddressGenerator.getUsedAddresses(EXTERNAL_CHAIN)
            let address = paymentRecieverAddressGenerator.getAddress(EXTERNAL_CHAIN, index).getPublicAddress(0)

            // LEFT OFF AT FINAL CONDITIONAL 
            if (usedAddresses.transactions.length > 0) {
                getAddress(index++, xPub, currency) // Recursion until there is an address with no transactions
            }
            return {address, index}
        }

  
        let MinPercentFromMinHashrate = rent.MinPercentFromMinHashrate
        let paymentRecieverXPub = user.wallet[token.toLowerCase()].xPrv
        let btcxPrv = user.wallet.btc.xPrv


        if ( MinPercentFromMinHashrate > Xpercent/100 ) {
            return {
                update: true,
                message: `Your pecent of the network ${Xpercent} changed to ${(MinPercentFromMinHashrate*100.1).toFixed(2)}%, to `+
                         `continute renting with ${Xpercent}% for the MiningRigRental market, change percentage and switch renting on again.`,
                Xpercent: (MinPercentFromMinHashrate*100.1).toFixed(2),
                autoRent: false
            }
        }

        // If user rents for first time with no xPub will save xPub ( paymentRecieverXPub ) to the DB
        for( let profile of user.profiles ) {
            if (profile._id.toString() === profile_id) {
       
                // If user doesn't have a generated address will generate a new one and save address and index to DB
                if ( profile.address.publicAddress === '') {
                    let usedIndexes = user.indexes 

                    let newAddress = getAddress(0, paymentRecieverXPub, token, usedIndexes)
                    let btcAddress = getAddress(0, btcxPrv , 'bitcoin', usedIndexes)
                    console.log('newAddress.index',newAddress.index)
                    profile.address.publicAddress = newAddress.address
                    profile.address.btcAddress = btcAddress.address
                    options.address = newAddress.address
                    let index = newAddress.index
                    user.indexes.push(index)

                    await user.save()
                    break;
                } 
            }
        }

        
        if (!user) {
            return 'Can\'t find user. setup.js line#16'
        }
        
        options.to_do = {
            rent: {
                rent: true,
            }
        }
        options.NetworkHashRate = rent.Networkhashrate
        options.MinPercent = rent.MinPercentFromMinHashrate
        options.emitter = emitter
        options.duration = token == "FLO" ? 24 : 3
        options.newRent = Rent
        options.difficulty = rent.difficulty
        options.hashrate = rent.Rent
        options.rentType = 'Manual' 
        return options
    } catch (e) {
        return {err: 'Can\'t find user or input is wrong.'+ e}
    }
}

/* POST settings  page */
router.post('/',  async (req, res) => {
 
    let userInput = await processUserInput(req, res).then(data => data).catch(err => err)
    // console.log('processUserInput ', userInput)

    // Any data that has been updated with a message, it updates the user to proceed again
    if (userInput['update']) {
        return res.json(userInput)
    }
 
    try {
        let data = await controller(userInput);
        res.status(200).json({data: data, fromRent: data})

    } catch (err) {
        console.log('route rent.js catch error', err);
        res.status(500).json({err: err})
    }
});

module.exports = router;