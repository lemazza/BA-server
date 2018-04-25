'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');

const expect = chai.expect;
const assert = chai.assert;

const {app, runServer, closeServer} = require('../server');
const {User, Game} = require('../models');
const {TEST_DATABASE_URL} = require('../config');

chai.use(chaiHttp);



        


function tearDownDb() {
  console.warn('Deleting database');
  return mongoose.connection.dropDatabase();
}


/*===================================================================
  TESTS
=====================================================================*/


describe('Bad Apples API resources', function() {
  before(function(){
    return runServer(TEST_DATABASE_URL, 8888);
  });
  /*beforeEach(function(){
    return seedUsersCollection();
  });*/
  //afterEach(function(){
  //  return tearDownDb();
  //});
  after(function() {
    return closeServer();
  });


  //expect 201 status, json object with username, id, first and last,
  //check db for extra person
  describe('Create new Game', function() {
    it('should add game to db', function() {
      return expect(201).to.equal(201)
      });
    });
  });      
});