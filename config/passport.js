const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const _ = require('lodash');

const {Client} = require("cassandra-driver");
const client = new Client({
    cloud: {
        secureConnectBundle: 'C:\\Users\\Petra\\Documents\\Faks\\secure-connect-NBP.zip'
    },
    credentials: {
        username: 'rentacar',
        password: 'rentacar'
    },
    keyspace: 'rentacar'
});

async function run() {
    await client.connect();
}

module.exports = function (passport) {
    passport.use(new LocalStrategy({
        usernameField: 'email'
    }, async (email, password, done) => { // Match user
        var query = 'SELECT * FROM \"User\" WHERE email=? ;';
        await client.execute(query, [email], (err, user) => {
            if (_.isEmpty(user.rows)) {
                return done(null, false, {message: 'Ne postoji korisnik sa datim emailom'});
            }

            // Match password
            bcrypt.compare(password, user.rows[0].lozinka, (err, isMatch) => {
                if (err) 
                    console.log(err);
                

                if (isMatch) {
                    return done(null, user.rows[0]);
                } else {
                    return done(null, false, {message: 'Pogrešna lozinka'});
                }

            });
        })
    }));

    passport.serializeUser(function (user, done) {
        done(null, user);
    });

    passport.deserializeUser(function (user, done) {
        done(null, user);
    });
};
