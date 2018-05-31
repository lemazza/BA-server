'use strict';
//'mongodb://localhost/badApplesDb' ||
exports.DATABASE_URL = process.env.DATABASE_URL  ||  'mongodb://lemazza:12r46a@ds157639.mlab.com:57639/bad-apples';
exports.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'mongodb://localhost/test-badApplesDb';


exports.PORT = process.env.PORT || 8888;


exports.JWT_SECRET = process.env.JWT_SECRET || 'password123';
exports.JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';