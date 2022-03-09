//jshint esversion:6
require('dotenv').config();
// two lines down are lower level securitymeasure to encript the password
// const bcrypt = require('bcrypt');
// const saltRounds = 10;
const express = require("express");
const ejs = require("ejs");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const _ = require("lodash");
const app = express();
// Express-session - an HTTP server-side framework used to create and manage a session middleware
const session = require("express-session");
// Passport is authentication middleware for Node.js. A comprehensive set of strategies
// support authentication using a username and password, Facebook, Twitter, and more
const passport = require("passport");
// Passport-Local Mongoose is a Mongoose plugin that simplifies building username and password login with Passport.
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require('mongoose-findorcreate');

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({
  extended: true
}));
// intializing a session before using the passport
app.use(session({
  secret: "your little secret",
  resave: false,
  saveUninitialized: false
}));
// initializing a passport;
app.use(passport.initialize());
// tell passport to manage the session
app.use(passport.session());

mongoose.connect("mongodb://localhost:27017/userDB", {
  useNewUrlParser: true
});

const userSchema = new mongoose.Schema({
  userName: String,
  passWord: String,
  googleId: String,
  secret: String
});
// after using the session, add a plug in to hash and salt user to add it into the mongo dattabase.
userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model("User", userSchema);

// passportLocalMongoose's doing: use static authenticate method of model in LocalStrategy
passport.use(User.createStrategy());
// configure Passport to manage the login session
passport.serializeUser(function(user, cb) {
  process.nextTick(function() {
    console.log("serializeUser");
    cb(null, {
      id: user.id,
      username: user.username
    });
  });
});

passport.deserializeUser(function(user, cb) {
  process.nextTick(function() {
    console.log("deserializeUser");
    return cb(null, user);
  });
});

passport.use(new GoogleStrategy({

    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets",
    // fix for deprecating the googlePlus
    // userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    console.log(profile.id +" Name:"+profile.displayName);
    User.findOrCreate({
      googleId: profile.id,
      userName: profile.displayName
    }, function(err, user) {
      return cb(err, user);
    });
  }
));

app.get("/", function(req, res) {
  res.render("home");
});
// this get doesn't have the function(req,res)
app.get("/auth/google",
  passport.authenticate("google", {
    scope: ["profile"]
  }));

app.get("/auth/google/secrets",
  passport.authenticate("google", {
    failureRedirect: "/login"
  }),
  function(req, res) {
    // Successful authentication, redirect to secrets.
    console.log("successfully authenticate");
    res.redirect("/secrets");
  });

app.get("/register", function(req, res) {
  res.render("register");
});

app.get("/secrets", function(req, res) {
  //pick out users whoes secret is not null
  User.find({"secret":{$ne: null}}, function(err, foundUsers){
    if(err){
      console.log(err);
    }else{
      res.render("secrets", {usersWithSecrets:foundUsers});
    }

  });
});

app.post("/register", function(req, res) {
  // the register() is from passportLocalMongoose to add data into MongoDB.
  User.register({
    username: req.body.username
  }, req.body.password, function(err, user) {
    if (err) {
      console.log(err);
      res.redirect("/");
    } else {
      //why the passport.authenticate("local")(req,res,function())? "local" is the method to authenticate.
      passport.authenticate("local")(req, res, function() {
        res.redirect("/secrets");
      });
    }
  });
});
//bycrypt and salted securitymeasure to do app.post("/register")
// app.post("/register", function(req,res){
//   bcrypt.hash(req.body.password, saltRounds, function(err, hash) {
//     const newEmail = _.toLower(req.body.username);
//     console.log(newEmail);
//     const newPW = hash;
//     const newUser = new User({
//       userName: newEmail,
//       passWord: newPW
//     });
//     newUser.save(function(err){
//       if(!err){
//         res.redirect("/");
//       }else{
//         console.log(err);
//       }
//     });
// });
//
// });

app.get("/login", function(req, res) {
  res.render("login");
});
// Angela's original login authentication.
// app.post("/login",function(req,res){
//   const user = new User({
//     username: req.body.username,
//     password: req.body.password
//   });
//   req.login(user,function(err){
//     if(err){
//       console.log(err);
//     }else{
//       passport.authenticate("local")(req,res,function(){
//         res.redirect("/secrets");
//       })
//     }
//   })
// });
// This login post is much shorter, but do the same work as the above one.
app.post("/login",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureMessage: true
  }),
  function(req, res) {
    res.redirect("/secrets");
  });
//bycrypt and salted securitymeasure to do app.post("/login")
// app.post("/login", function(req,res){
//
//   User.findOne({userName:_.toLower(req.body.username)},function(err,foundname){
//       if(!err){
//         if(!foundname){
//           res.send("No such user. Please register and then login to lock your secrets.");
//         }else{
//           bcrypt.compare(req.body.password, foundname.passWord, function(erro, result) {
//     // result == true
//             if(result == true){res.render("secrets");
//           }
//             else{
//               res.send("Your password doesn't match. ");
//             }
// });
//           // 5 lines down are 1st level securitymeasure.
//           // if(foundname.passWord === req.body.password){
//           //   res.render("secrets");
//           // }else{
//           //   res.send("Your password doesn't match. ");
//           // }
//         }
//       }else{res.send(err);}
//
//   });
// });
app.get("/submit",function(req,res){
  if(req.isAuthenticated()){
    res.render("submit");
  }else{
    res.redirect("/login");
  }
});
app.post("/submit",function(req,res){
  const submittedSecret = req.body.secret;
  User.findById(req.user.id, function(err,foundUser){
    if(err){
      console.log(err);
    }else{
      if (foundUser){
        foundUser.secret= submittedSecret;
        foundUser.save(function(){
          res.redirect("/secrets");
        });
      }
    }
  });
});
app.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/");
});

app.listen(3000, function() {
  console.log("Server is litening on part 3000. ")
});
