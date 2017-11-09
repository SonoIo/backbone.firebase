const assert = chai.assert;
const config = {
	apiKey: "<API-KEY>",
	authDomain: "<PROJECT.ID>.firebaseapp.com",
	databaseURL: "https://<PROJECT.ID>.firebaseio.com",
	storageBucket: "<PROJECT.ID>.appspot.com"
};

import * as firebase from 'firebase';
import FirebaseCollection from '../../lib/collections/FirebaseCollection';
import Messages from '../../lib/collections/Messages';
import Message from '../../lib/models/Message';
import Attachment from '../../lib/models/Attachment';
import User from '../../lib/models/User';

const fetch = (model, done) => {
	model.fetch({
		success: () => {
			done();
		}
	});
}

describe('Firebase', () => {

	before((done) => {
		firebase.initializeApp(config);
		done();
	});

	beforeEach((done) => {
		firebase.database().ref().set(require('./fixtures/db.json')).then(() => {
			done();
		});
	});

	after((done) => {
		done();
	});

	it('should fetch messages', (done) => {
		const messages = new Messages();
		messages.fetch({
			success: () => {
				assert.isAbove(messages.length, 0, 'messages.length should be at least 0');
				messages.releaseFirebase();
				done();
			},
			error: (collection, error, options) => {
				done(error);
			}
		});
	});

	it('should create a new message', (done) => {
		const messages = new Messages();
		const newMessageData = {
			sender: 'Sender' + Math.ceil(Math.random() * 100),
			message: 'Fooooo barrrrr'
		};
		const newMessage = messages.create(newMessageData, {
			success: () => {
				assert.lengthOf(messages, 1, 'messages.length should be equal to 1');
				assert.equal(messages.at(0).id, newMessage.id, 'messages[0].id should be equal to ' + newMessage.id);
				done();
			},
			error: (model, err, options) => {
				done(err);
			}
		});
	});

	it('should receive an "add" event when a new message is created', (done) => {
		const messages = new Messages();
		messages.once('add', (newModel) => {
			assert.equal(messages.at(0).id, newModel.id, 'New model\'s ID should be equal to ' + newModel.id);
			done();
		});
		const newMessageData = {
			sender: 'Sender' + Math.ceil(Math.random() * 100),
			message: 'Notification'
		};
		const newMessage = messages.create(newMessageData, {
			success: () => {
				assert.lengthOf(messages, 1, 'messages.length should be equal to 1');
			},
			error: (model, err, options) => {
				done(err);
			}
		});
	});

	it('should remove a message through filtered collection', (done) => {
		const messages = new Messages();
		messages.once('remove', (removedModel) => {
			assert.equal(removedModel.id, 'm1', 'Removed model should be "m1"');
			messages.releaseFirebase();
			done();
		});
		messages.fetch({
			query: messages.query().limitToFirst(2),
			success: () => {
				messages.at(0).destroy();
			},
			error: (collection, err, options) => {
				done(err);
			}
		});
	});

	it('should update a message through filtered collection', (done) => {
		const messages = new Messages();
		messages.once('change', (changedModel) => {
			assert.equal(changedModel.get('sender'), 'EditedSender', 'The new sender should be "EditedSender"');
			releaseFirebaseAndDone();
		});
		messages.fetch({
			query: messages.query().orderByKey().startAt('m2').endAt('m4'),
			error: (collection, err, options) => {
				done(err);
			}
		});
		// Edit the model in another ref
		const message = new Message({ id: 'm2' });
		message.fetch({
			success: () => {
				message.set('sender', 'EditedSender', { silent: true });
				message.save();
			}
		});

		function releaseFirebaseAndDone() {
			messages.releaseFirebase();
			message.releaseFirebase();
			done();
		}
	});

	it('should execute a query', (done) => {
		const messages = new Messages();
		const query = messages.query().orderByKey().startAt('m2').endAt('m4');
		messages.fetch({
			query: query,
			success: () => {
				assert.lengthOf(messages, 3, 'messages.length should be equals to 3');
				done();
			},
			error: (collection, err, options) => {
				done(err);
			}
		});
	});

	it('should paginate a query with ascending order with different page size', (done) => {
		const messages = new Messages();
		// First fetch
		messages.fetch({
			query: messages.query(),
			pageSize: 3,
			success: () => {
				assert.lengthOf(messages, 3, 'messages.length should be equals to 2');
				assert.equal(messages.at(0).id, 'm1', 'messages[0].id should be "m1"');
				assert.equal(messages.at(1).id, 'm2', 'messages[1].id should be "m2"');
				assert.equal(messages.at(2).id, 'm3', 'messages[2].id should be "m3"');
				// Second page load
				messages.loadMore((err, moreToLoad, newEntriesLength, oldLenght) => {
					if (err) return done(err);
					assert.lengthOf(messages, 5, 'messages.length should be equals to 5');
					assert.equal(messages.at(3).id, 'm4', 'messages[3].id should be "m4"');
					assert.equal(messages.at(4).id, 'm5', 'messages[4].id should be "m5"');
					messages.releaseFirebase();
					done();
				});
			},
			error: (collection, err, options) => {
				done(err);
			}
		});
	});

	it('should paginate a query with ascending order', (done) => {
		const messages = new Messages();
		// First fetch
		messages.fetch({
			query: messages.query(),
			pageSize: 2,
			success: () => {
				assert.lengthOf(messages, 2, 'messages.length should be equals to 2');
				assert.equal(messages.at(0).id, 'm1', 'messages[0].id should be "m1"');
				assert.equal(messages.at(1).id, 'm2', 'messages[1].id should be "m2"');
				// Second page load
				messages.loadMore((err, moreToLoad, newEntriesLength, oldLenght) => {
					if (err) return done(err);
					assert.isTrue(moreToLoad, 'there should be more messages to load');
					assert.lengthOf(messages, 4, 'the new messages.length should be equals to 4');
					assert.equal(messages.at(2).id, 'm3', 'messages[2].id should be "m3"');
					assert.equal(messages.at(3).id, 'm4', 'messages[3].id should be "m4"');
					// Third page load
					messages.loadMore((err, moreToLoad, newEntriesLength, oldLenght) => {
						if (err) return done(err);
						assert.isFalse(moreToLoad, 'there should be no more messages');
						assert.lengthOf(messages, 5, 'the new messages.length should be equals to 5');
						assert.equal(messages.at(4).id, 'm5', 'messages[4].id should be "m5"');
						messages.releaseFirebase();
						done();
					});
				});
			},
			error: (collection, err, options) => {
				done(err);
			}
		});
	});

	it('should paginate a query with descending order', (done) => {
		const messages = new Messages();
		// First fetch
		messages.fetch({
			query: messages.query(),
			pageSize: 2,
			order: Messages.DESC,
			success: () => {
				assert.lengthOf(messages, 2, 'messages.length should be equals to 2');
				assert.equal(messages.at(0).id, 'm5', 'messages[0].id should be "m5"');
				assert.equal(messages.at(1).id, 'm4', 'messages[1].id should be "m4"');
				// Second page load
				messages.loadMore((err, moreToLoad, newEntriesLength, oldLenght) => {
					if (err) return done(err);
					assert.isTrue(moreToLoad, 'there should be more messages to load');
					assert.lengthOf(messages, 4, 'the new messages.length should be equals to 4');
					assert.equal(messages.at(2).id, 'm3', 'messages[2].id should be "m3"');
					assert.equal(messages.at(3).id, 'm2', 'messages[3].id should be "m2"');
					// Third page load
					messages.loadMore((err, moreToLoad, newEntriesLength, oldLenght) => {
						if (err) return done(err);
						assert.isFalse(moreToLoad, 'there should be no more messages');
						assert.lengthOf(messages, 5, 'the new messages.length should be equals to 5');
						assert.equal(messages.at(4).id, 'm1', 'messages[4].id should be "m1"');
						messages.releaseFirebase();
						done();
					});
				});
			},
			error: (collection, err, options) => {
				done(err);
			}
		});
	});

	it('should fetch a single model without a collection', (done) => {
		const user = new User({ id: 'u1' });
		user.fetch({
			success: (model, resp, options) => {
				const testData = {
					'id': 'u1',
					'email': 'foo@bar.it',
					'name': 'Foo'
				};
				assert.deepEqual(model.toJSON(), testData, 'User fetched is not equals to expect user');
				user.releaseFirebase();
				done();
			},
			error: (model, err, options) => {
				done(err);
			}
		});
	});

	it('should ensure that all Firebase references are removed', (done) => {
		const messages = new Messages();
		const attachment = new Attachment({ id: 'a1' }, { params: { messageId: 'm1' } });
		fetch(messages, () => {
			const message = messages.get('m1');
			message.attachments.once('change', (changedModel) => {
				done(new Error('Change event should not be triggered'));
			});
			fetch(message.attachments, () => {
				fetch(attachment, () => {
					messages.releaseFirebase(true);
					attachment.set('url', 'modified.zip');
					attachment.save();
					setTimeout(() => {
						done();
					}, 1000);
				});
			});
		});
	});

});
