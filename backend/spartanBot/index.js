
const rent = require('./rent/rent');
const add = require('./RentalProvider/add/add');
const attachSpartanBot = require('./RentalProvider/returnSpartanBot.js')
const clearSpartanBot = require('./RentalProvider/clearSpartanBot');
const SpartanBot = require('spartanbot').SpartanBot;

class Client {
    constructor(settings) {
        this.spartan = new SpartanBot()
        this.options = settings
        this.version = Math.floor(Math.random() * 4000)
        console.log(this.spartan, 'CLIENT')
        this.get()
    }
    get(version) {
        console.log('VERSION: ',this.version)
    }
    async controller(options) {
        let to_do = options.to_do
        options.SpartanBot = this.spartan
        switch (to_do) {
            case 'rent':
                console.log('this.spartan index.js 24', this.spartan)
                let rented = await rent(options).then((data)=>{
                }).catch(err => err);
                    return rented
            case 'add':
                console.log('this.spartan index.js 29', this.spartan)
                let added = await add(options).then((data)=>{
                    return data
                }).catch(err => err);
                return added;
            case 'clearSpartanBot':
                let cleared = clearSpartanBot(options)
                return cleared
                break;
            case 'returnSpartanBot': 
                let data = await attachSpartanBot(options)
                return options
                break;
        }
    }
}
module.exports = new Client()

