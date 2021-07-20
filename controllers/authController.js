const ErrorResponse = require('./../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const User = require('../models/userModel');
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');

//@desc   Register User
//@route  POST /api/v1/auth/register
//@access Public
exports.register = asyncHandler(async (req, res, next) => {

    const newUser = await User.create({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        role : req.body.role
    });
    
    sendTokenResponse(newUser, 200, res);
});

//@desc   Login User
//@route  POST /api/v1/auth/login
//@access Public
exports.login = asyncHandler(async (req, res, next) => {

    const {email, password} = req.body;

    //validate email and password
    if(!email || !password) {
        return next(new ErrorResponse('Please provide an email and password', 400));
    }

    //Check for user
    const user = await User.findOne({email}).select('+password');

    if(!user){
        return next(new ErrorResponse('Invalid Credentials', 401));
    }

    //check if password is correct
    const isCorrect = await user.matchPassword(password);

    if(!isCorrect){
        return next(new ErrorResponse('Invalid Credentials', 401));   
    }
    
   sendTokenResponse(user, 200, res);
});
 
//@desc   Get Current Logged In User
//@route  POST /api/v1/auth/me
//@access Private
exports.getMe = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id);
    res.status(200).json({success : true, data : user});
});

//@desc   Update User Details
//@route  PUT /api/v1/auth/updatedetails 
//@access Private
exports.updateDetails = asyncHandler(async (req, res, next) => {
    const fieldsToUpdate = {
        name: req.body.name,
        email: req.body.email,
    };

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
        new: true,
        runValidators: true,
    });

    res.status(200).json({
        success: true,
        data: user,
    });
});

//@desc   Update Password
//@route  PUT /api/v1/auth/updatepassword
//@access Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id).select('+password');

    //Check correct password
    if(!(await user.matchPassword(req.body.currentPassword))){
        return next(new ErrorResponse('Password is Incorrect', 401));
    }

    user.password = req.body.newPassword;
    await user.save();

    sendTokenResponse(user, 200, res);
});

//@desc   Forgot Password
//@route  POST /api/v1/auth/forgotpassword
//@access Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
    const user = await User.findOne({ email : req.body.email });

    if(!user){
        return next(new ErrorResponse('There is no user with that email', 404));
    }

    //Get Resent Token
    const resetToken = user.getResetPasswordToken();

    await user.save({ validateBeforeSave : false });

    //Create Reset URL
    const resetUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/resetpassword/${resetToken}`;
    const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n ${resetUrl}`;

    try {
        await sendEmail({
            email : user.email,
            subject: 'Password reset token',
            message,
        });

        res.status(200).json({success : true, data : 'Email sent'});
        
    } catch (error) {

        console.log(error);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
    
        await user.save({ validateBeforeSave: false });
    
        return next(new ErrorResponse('Email could not be sent', 500));
        
    }
});

// @desc      Reset password
// @route     PUT /api/v1/auth/resetpassword/:resettoken
// @access    Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resettoken)
      .digest('hex');
  
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });
  
    if (!user) {
      return next(new ErrorResponse('Invalid token', 400));
    }
  
    // Set new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
  
    sendTokenResponse(user, 200, res);
  });


//Get Token form model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {

    //create token 
   const token = user.getSignedJwtToken();

   const options = {
       expires : new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
       httpOnly : true
   };

   if(process.env.NODE_ENV === 'production'){
       options.secure = true;
   }

   res.status(statusCode)
      .cookie('token', token, options)
      .json({
          success : true,
          token
      })
};