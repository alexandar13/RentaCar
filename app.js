const express = require('express');
const flash = require('connect-flash');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const {Client} = require("cassandra-driver");
const {v4: uuidv4} = require('uuid');
const _ = require('lodash');

const app = express();
app.set('view engine', 'ejs');

require('./config/passport')(passport);

app.use(session({secret: 'secret', resave: true, saveUninitialized: true}));

app.use(passport.initialize());
app.use(passport.session());

const {isAdmin, ensureAuthenticated, isAutorized} = require('./config/auth');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.use(express.urlencoded({extended: true}));

app.use(express.static(__dirname + "/public"));

app.use(flash());

app.use(function (req, res, next) {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    next();
});

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

app.get('/', (req, res) => {
    res.render("home.ejs", {currentUser: req.user})
});

app.get('/register', (req, res) => {
    res.render("register.ejs", {currentUser: req.user})
});

app.get('/login', (req, res) => {
    res.render("login.ejs", {currentUser: req.user})
});

app.post('/register', async (req, res) => {
    const {
        name,
        email,
        adresa,
        broj,
        password,
        password2
    } = req.body;
    let errors = [];

    if (!name || !email || !adresa || !broj || !password || !password2) {
        errors.push({msg: 'Popunite sva polja'});
    }

    if (password != password2) {
        errors.push({msg: 'Lozinke se ne poklapaju'});
    }

    if (password.length < 6) {
        errors.push({msg: 'Lozinka mora da ima bar 6 karaktera'});
    }

    if (errors.length > 0) {
        res.render("register.ejs", {
            errors,
            name,
            adresa,
            broj,
            email,
            password,
            password2,
            currentUser: req.user
        });
    } else {
        var query = 'SELECT * FROM \"User\" WHERE email=? ;';
        await client.execute(query, [email], (err, user) => {
            if (err) 
                throw err;
            


            if (! _.isEmpty(user.rows)) {
                errors.push({msg: 'Korisnik sa unetim emailom već postoji'});
                res.render("register.ejs", {
                    errors,
                    name,
                    adresa,
                    broj,
                    email,
                    password,
                    password2,
                    currentUser: req.user
                });
            } else {
                bcrypt.genSalt(10, (err, salt) => {
                    bcrypt.hash(password, salt, async (err, hash) => {
                        if (err) 
                            throw err;
                        


                        var query1 = 'INSERT INTO \"User\" (uid, ime, adresa, broj_telefona, email, lozinka, tip) VALUES (?, ?, ?, ?, ?, ?, ?);';
                        await client.execute(query1, [
                            uuidv4(),
                            name,
                            adresa,
                            broj,
                            email,
                            hash,
                            'korisnik'
                        ], {
                            prepare: true
                        }, (err, result) => {
                            console.log(err);
                            req.flash('success_msg', 'Registrovani ste i možete se prijaviti');
                            res.redirect('/login');
                        })
                    })
                })
            }
        })
    }
});

app.post('/login', (req, res, next) => {
    passport.authenticate('local', {
        successRedirect: '/',
        failureRedirect: '/login',
        failureFlash: true
    })(req, res, next);
});

app.get('/logout', (req, res) => {
    req.logout();
    req.flash('success_msg', 'Odjavljeni ste');
    res.redirect('/login');
});

app.get('/vozila', async (req, res) => {
    var query = 'SELECT * FROM \"Vozilo\";';
    await client.execute(query, [], {
        prepare: true
    }, (err, vozila) => {
        if (err) 
            console.log(err);
        

        res.render("vozila.ejs", {
            currentUser: req.user,
            vozila: vozila.rows
        })
    })
});

app.get('/vozila/new', isAdmin, (req, res) => {
    res.render("dodajVozilo.ejs", {currentUser: req.user})
});

app.get('/vozila/:vid/edit', isAdmin, async (req, res) => {
    var query = 'SELECT * FROM \"Vozilo\" WHERE vid=?;';
    await client.execute(query, [req.params.vid], {
        prepare: true
    }, (err, vozilo) => {
        if (err) 
            console.log(err);
        
        res.render("editVozilo.ejs", {
            currentUser: req.user,
            vozilo: vozilo.rows[0]
        })
    })
});

app.post('/vozila/:vid/edit', async (req, res) => {
    var query = 'UPDATE \"Vozilo\" SET cena=?, registracija=?, slika=?, opis=? WHERE vid=?;';
    await client.execute(query, [
        req.body.cena,
        req.body.registracija,
        req.body.slika,
        req.body.opis,
        req.params.vid,
    ], {
        prepare: true
    }, (err, result) => {
        if (err) 
            console.log(err);
        

        req.flash('success_msg', 'Podaci o vozilu su izmenjeni!');
        res.redirect('/vozila');
    })
})

app.post('/vozila/new', async (req, res) => {
    var query = 'INSERT INTO \"Vozilo\" (vid, cena, tip, marka, model, registracija, slika, opis, gorivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);';
    await client.execute(query, [
        uuidv4(),
        req.body.cena,
        req.body.tip,
        req.body.marka,
        req.body.model,
        req.body.registracija,
        req.body.slika,
        req.body.opis,
        req.body.gorivo
    ], {
        prepare: true
    }, (err, result) => {
        if (err) 
            console.log(err);
        


        req.flash('success_msg', 'Novo vozilo je sačuvano!');
        res.redirect('/vozila');
    })
})

app.post('/vozila/:vid/delete', async (req, res) => {
    var i = 0;
    var query = 'SELECT * FROM \"Rezervacija\" WHERE voziloid=?;';
    await client.execute(query, [req.params.vid], {
        prepare: true
    }, (err, rezervacija) => {
        if (err) 
            console.log(err);
        


        if (! _.isEmpty(rezervacija.rows)) {
            rezervacija.rows.forEach(r => {
                if (Date.parse(rezervacija.rows[0].datumkraja.date) > Date.parse(new Date())) 
                    i++;
                

            })
        }
        if (i != 0) {
            req.flash('error_msg', 'Vozilo se ne može obrisati dok je rezervisano!');
            res.redirect('/vozila');
        } else {
            var query1 = 'DELETE FROM \"Vozilo\" WHERE vid=?;';
            client.execute(query1, [req.params.vid], {
                prepare: true
            }, (err, result) => {
                if (err) 
                    console.log(err);
                

                req.flash('success_msg', 'Vozilo je obrisano!');
                res.redirect('/vozila');
            })
        }
    })
})

app.post('/rezervacija/new/:vid/:uid', async (req, res) => {
    if (!req.body.datumpocetka || !req.body.datumkraja) {
        req.flash('error_msg', 'Sva polja moraju biti popunjena!');
        res.redirect('/vozila/' + req.params.vid);
    } else if (Date.parse(req.body.datumpocetka) < Date.parse(new Date())) {
        req.flash('error_msg', 'Datum početka rezervacije mora biti nakon današnjeg datuma!');
        res.redirect('/vozila/' + req.params.vid);
    } else if (Date.parse(req.body.datumkraja) < Date.parse(new Date())) {
        req.flash('error_msg', 'Datum kraja rezervacije mora biti nakon današnjeg datuma!');
        res.redirect('/vozila/' + req.params.vid);
    } else if (Date.parse(req.body.datumkraja) < Date.parse(req.body.datumpocetka)) {
        req.flash('error_msg', 'Datum kraja rezervacije mora biti nakon datuma početka rezervacije!');
        res.redirect('/vozila/' + req.params.vid);
    } else {
        var query = 'SELECT * FROM \"Rezervacija\" WHERE voziloid=? AND datumpocetka >= ? AND datumpocetka <= ? ;';
        await client.execute(query, [ req.params.vid,
            req.body.datumpocetka, req.body.datumkraja
        ], {
            prepare: true
        }, async (err, rezervacije) => {
            if(err) 
                console.log(err);
            if (! _.isEmpty(rezervacije.rows)) {
                req.flash('error_msg', 'Vozilo je rezervisano u traženom periodu!');
                res.redirect('/vozila/' + req.params.vid);
            } else {
                query = 'SELECT * FROM \"Rezervacija\" WHERE voziloid=? AND datumpocetka < ?;';
                await client.execute(query, [ req.params.vid,
                    req.body.datumpocetka
                ], {
                    prepare: true
                }, async (err, rez) => {
                    if(err) 
                        console.log(err);
                    var i=0;
                    rez.rows.forEach(rezerv=>{
                        if(Date.parse(rezerv.datumkraja) >= Date.parse(req.body.datumpocetka)){
                            i++;
                        }
                    })
                    if (i != 0) {
                        req.flash('error_msg', 'Vozilo je rezervisano u traženom periodu!');
                        res.redirect('/vozila/' + req.params.vid);
                    } else {
                        query = 'INSERT INTO \"Rezervacija\" (rid, voziloid, userid, datumpocetka, datumkraja) VALUES (?, ?, ?, ?, ?);';
                        await client.execute(query, [
                            uuidv4(), req.params.vid, req.params.uid, req.body.datumpocetka, req.body.datumkraja
                        ], {
                            prepare: true
                        }, async (err, result) => {
                            if(err)
                                console.log(err);
                            req.flash('success_msg', 'Rezervacija je dodata!');
                            res.redirect('/vozila/' + req.params.vid);
                        })
                    }
                })
            }
        })
    }
});

app.get('/vozila/cena/rastuca', async (req, res) => {
    var query = 'SELECT * FROM \"Vozilo\";';
    await client.execute(query, [], {
        prepare: true
    }, (err, vozila) => {
        if (err) 
            console.log(err);
        


        var vozilaArr = [];
        vozila.rows.forEach(vozilo => {
            vozilaArr.push({
                vid: vozilo.vid,
                cena: vozilo.cena,
                marka: vozilo.marka,
                tip: vozilo.tip,
                model: vozilo.model,
                registracija: vozilo.registracija,
                slika: vozilo.slika,
                opis: vozilo.opis,
                gorivo: vozilo.gorivo
            })
        })

        var v = [];

        v = _.orderBy(vozilaArr, 'cena', "asc");

        res.render("vozila.ejs", {
            currentUser: req.user,
            vozila: v
        })
    })
});

app.get('/vozila/cena/opadajuca', async (req, res) => {
    var query = 'SELECT * FROM \"Vozilo\";';
    await client.execute(query, [], {
        prepare: true
    }, (err, vozila) => {
        if (err) 
            console.log(err);
        


        var vozilaArr = [];
        vozila.rows.forEach(vozilo => {
            vozilaArr.push({
                vid: vozilo.vid,
                cena: vozilo.cena,
                marka: vozilo.marka,
                tip: vozilo.tip,
                model: vozilo.model,
                registracija: vozilo.registracija,
                slika: vozilo.slika,
                opis: vozilo.opis,
                gorivo: vozilo.gorivo
            })
        })

        var v = [];

        v = _.orderBy(vozilaArr, 'cena', "desc");

        res.render("vozila.ejs", {
            currentUser: req.user,
            vozila: v
        })
    })
});

app.get('/vozila/:vid', ensureAuthenticated, async (req, res) => {
    var query = 'SELECT * FROM \"Vozilo\" WHERE vid=?;';
    await client.execute(query, [req.params.vid], {
        prepare: true
    }, (err, vozilo) => {
        if (err) {
            console.log(err);
        } else {
            var query1 = 'SELECT * FROM \"Rezervacija\" WHERE voziloid=?; ';
            client.execute(query1, [req.params.vid], {
                prepare: true
            }, (err, rezervacija) => {
                if (err) {
                    console.log(err);
                } else {
                    res.render("voziloProfil.ejs", {
                        currentUser: req.user,
                        vozilo: vozilo.rows[0],
                        rezervacija: rezervacija.rows
                    })
                }
            })
        }
    })
})

app.get('/profil/:uemail', isAutorized, async (req, res) => {
    var query = 'SELECT * FROM \"User\" WHERE email=?;';
    await client.execute(query, [req.params.uemail], {
        prepare: true
    }, async (err, user) => {
        if (err) 
            console.log(err);
        
        var query = 'SELECT * FROM \"Rezervacija\";';
        await client.execute(query, [], {
            prepare: true
        }, (err, rezervacije) => {
            if (err) 
                console.log(err);
            

            var rezArr = [];
            rezervacije.rows.forEach(rezervacija => {
               
                if (rezervacija.userid.equals(user.rows[0].uid)) {
                    rezArr.push({
                        rid: rezervacija.rid,
                        voziloid: rezervacija.voziloid,
                        userid: rezervacija.userid,
                        datumpocetka: rezervacija.datumpocetka,
                        datumkraja: rezervacija.datumkraja
                    })
                }
            })
                   
            res.render("profil.ejs", {
                currentUser: req.user,
                korisnik: user.rows[0],
                rezervacije: rezArr
            })
        })
    })
})

app.get('/korisnik/:email/edit', async (req, res) => {
    var query = 'SELECT * FROM \"User\" WHERE email=?;';
    await client.execute(query, [req.params.email], {
        prepare: true
    }, (err, korisnik) => {
        if (err) 
            console.log(err);
        
        res.render("editUser.ejs", {
            currentUser: req.user,
            korisnik: korisnik.rows[0]
        })
    })
});

app.post('/korisnik/:email/edit', async (req, res) => {
    var query = 'UPDATE \"User\"  SET ime=?, adresa=?, broj_telefona=?   WHERE email=? ;';
    await client.execute(query, [
        req.body.ime,
        req.body.adresa,
        req.body.broj_telefona,
        req.params.email
    ], {
        prepare: true
    }, (err, result) => {
        if (err) 
            console.log(err);

        req.flash('success_msg', 'Podaci o korisniku su izmenjeni!');
        res.redirect('/');
    })
})

app.post('/rezervacija/:uemail/:vid/:datumpocetka/delete',  async (req, res) => {
    var query='DELETE FROM "\Rezervacija\" WHERE voziloid=? AND datumpocetka=?;';
    await client.execute(query,[req.params.vid, req.params.datumpocetka],{
        prepare:true
    }, (err, result)=>{
         if(err){
             console.log(err);
         }
         req.flash('success_msg', 'Rezervacija je obrisana!');
         res.redirect('/profil/' + req.params.uemail);
    })
 })

app.listen(3000);
console.log('Server started on port 3000..');

module.exports = app;
