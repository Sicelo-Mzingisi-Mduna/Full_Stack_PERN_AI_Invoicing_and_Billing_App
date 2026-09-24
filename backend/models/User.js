const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name: { // authentication
    type: String,
    required: true,
  },
  email:{ // authentication
    type: String,
    required: true,
    unique: true,
  },
  password: { // authentication
    type: String,
    required: true,
  },
}, { timestamps: true });

// Encrypt password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 10);
});

// Method to entered password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
}

module.exports = mongoose.model("User", userSchema);