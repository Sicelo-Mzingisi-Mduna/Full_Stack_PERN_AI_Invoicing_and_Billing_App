const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Generate token
const generateToken = (id) => {
  return jwt.sign({id}, process.env.JWT_SECRET, {
    expiresIn: '60d',
  });
};

// @desc Register new user
exports.register = async (req, res) => {
  try{
    
  } catch(err){
    res.status(500).json({
      message: err.message
    })
  }
}

// @desc Login existing user
exports.login = async (req, res) => {
  try{

  } catch(err){
    res.status(500).json({
      message: err.message
    })
  }
}

