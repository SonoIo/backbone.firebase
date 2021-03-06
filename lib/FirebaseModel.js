import Backbone from "backbone";
import _ from "underscore";
import * as firebase from "firebase/app";
import sync from "./utils/sync";
import context from "context-utils";

/**
 * Firebase Backbone model
 * @extends Backbone.Collection
 * @param {Object} attrs - Attributes of the model
 * @param {Object} options - Options object
 * @param {Object} [options.firebase] - Instance of firebase app if different from default
 * @param {Object} [options.params] - Extra data useful to create firebase path. i.e. `/parent/child/${this.params.childId}/`.
 * @param {Bool} [options.created] - Adds a created field to every created model with the timestamp of the server
 * @param {Bool} [options.modified] - Adds a modified field to every saved model with the timestamp of the server
 */
export default class FirebaseModel extends Backbone.Model {

	constructor(attrs, options) {
		super(attrs, options);

		this.options = _.defaults(options || {}, {
			firebase: context.firebase || firebase,
			params: {},
			created: true,
			modified: true
		});

		this.firebase = this.options.firebase;
		this.params = this.options.params;
		this.childCollections = {};
		this.childModels = {};
	}

	/**
	 * Returns the Firebase reference to the database path described by this.url
	 * @return {Reference} - Firebase reference to the database path
	 */
	getReference() {
		return this.firebase.database().ref(_.result(this, 'url'));
	}

	/**
	 * Fetch model from Firebase and bind database events
	 * @param {Object} [options] - Options object
	 * @param {Bool} [options.parse] [true] - Should or not call the parse method
	 * @param {Bool} [options.bind] [true] - if true binds child_added, child_changed, child_removed events to the model
	 */
	fetch(options) {
		this.fetching = true;
		options = _.defaults(options || {}, {
			bind: true
		});
		this.releaseFirebase();
		this.db_ref = this.getReference();
		if (options.bind) this.bindFirebase();
		return super.fetch(options);
	}

	/**
	 * Close every db listener, remember to call it when you are done with a
	 * collection. Calls every inner model .releaseFirebase() to ensure
	 * no event handler is attached.
	 * @return {FirebaseModel} - Return self
	 */
	releaseFirebase() {
		if (this.db_ref) {
			this.db_ref.off();
		}
		_.forEach(this.childCollections, (aChildCollection) => {
			if (aChildCollection.releaseFirebase)
				aChildCollection.releaseFirebase();
		});
		_.forEach(this.childModels, (aChildModel) => {
			if (aChildModel.releaseFirebase)
				aChildModel.releaseFirebase();
		});
	}

	/**
	 * Connect collection to the Firebase db. this.db_ref must be set.
	 * @return {FirebaseModel} - Return self
	 */
	bindFirebase() {
		this.db_ref.on('child_added', (snapshot) => {
			// console.log('Added', snapshot.key, snapshot.val());
			this.set(snapshot.key, snapshot.val(), { silent: true });
			this.trigger('change:' + snapshot.key, this, snapshot.val(), {});
			this.trigger('change', this, {});
		});
		this.db_ref.on('child_changed', (snapshot) => {
			// console.log('Changed', snapshot.key, snapshot.val());
			this.set(snapshot.key, snapshot.val());
		});
		this.db_ref.on('child_removed', (snapshot) => {
			// console.log('Remove', snapshot.key);
			this.unset(snapshot.key);
		});
	}

	/**
	 * Adds a child collection to the model. It will mantain the
	 * releaseFirebase chain.
	 * @param {String} name - Name of the collection
	 * @param {FirebaseCollection} childCollection - FirebaseCollection Instance
	 * @return {FirebaseModel} - Return self
	 */
	addChildCollection(name, childCollection) {
		this.childCollections[name] = childCollection;
		return this;
	}

	/**
	 * Remove a child collection
	 * @param {String} name - Name of the collection
	 * @return {FirebaseModel} - Return self
	 */
	removeChildCollection(name) {
		delete this.childCollections[name];
		return this;
	}

	/**
	 * Retrieve the child collection
	 * @param  {String} name - Name of the collection to return
	 * @return {FirebaseCollection} - Return the child collection with given 'name'
	 */
	getChildCollection(name) {
		return this.childCollections[name];
	}

	/**
	 * Adds a child model. It will mantain the releaseFirebase chain.
	 * @param {String} name - Name of the collection
	 * @param {FirebaseCollection} childCollection - FirebaseCollection Instance
	 * @return {FirebaseModel} - Return self
	 */
	addChildModel(name, childModel) {
		this.childModels[name] = childModel;
		return this;
	}

	/**
	 * Remove a child model
	 * @param {String} name - Name of the model
	 * @return {FirebaseModel} - Return self
	 */
	removeChildModel(name) {
		delete this.childModels[name];
	}

	/**
	 * Retrieve the child model
	 * @param  {String} name - Name of the model to return
	 * @return {FirebaseModel} - Return the child model with given 'name'
	 */
	getChildModel(name) {
		return this.childModels[name];
	}

	/**
	 * The collection is fetched
	 * @return {Boolean}
	 */
	isFetched() {
		return this.fetched;
	}

	/**
	 * The collection is fetching data
	 * @return {Boolean}
	 */
	isFetching() {
		return this.fetching;
	}

}

FirebaseModel.prototype.sync = sync;
