import Backbone from "backbone";
import _ from "underscore";
import * as firebase from "firebase/app";
import "firebase/database";
import sync from "./utils/sync";
import context from "context-utils";

const ASC  = 'asc';
const DESC = 'desc';

/**
 * Firebase Backbone collection
 * @extends Backbone.Collection
 * @param {[Backbone.Model]} models - Array of models
 * @param {Object} options - Options object
 * @param {Object} [options.firebase] - Instance of firebase app if different from default
 * @param {Object} [options.params] - Extra data useful to create firebase path. i.e. `/parent/child/${this.params.childId}/`.
 * @param {Bool} [options.created] - Adds a created field to every created model with the timestamp of the server
 * @param {Bool} [options.modified] - Adds a modified field to every saved model with the timestamp of the server
 */
export default class FirebaseCollection extends Backbone.Collection {

	constructor(models, options) {
		super(models, options);

		this.options = _.defaults(options || {}, {
			firebase: context.firebase || firebase,
			params: {},
			created: true,
			modified: true
		});

		this.firebase = this.options.firebase;
		this.params = this.options.params;

		this.db_handler = {};
		this.db_ref = null; // this.getReference();
		this.fetched = false;
		this.lastQueryParams = {
			query: null,
			pageSize: null,
			order: null
		};
		this.moreToLoad = true;
		this.fetching = false;
		this.fetched = false;
	}

	/**
	 * Returns the Firebase reference to the database path described by this.url
	 * @return {Reference} - Firebase reference to the database path
	 */
	getReference() {
		return this.firebase.database().ref(_.result(this, 'url'));
	}

	/**
	 * Alias of getReference() to be used when fetching
	 * @return {Reference} - Firebase reference to the database path
	 */
	query() {
		return this.getReference();
	}

	/**
	 * Fetch models from Firebase and bind database events
	 * @param {Object} [options] - Options object
	 * @param {Bool} [options.parse] [true] - Should or not call the parse method
	 * @param {Bool} [options.bind] [true] - if true binds child_added, child_changed, child_removed events to the models
	 * @param {Reference} [options.query] [this.query()] - Query reference to execute
	 * @param {Int} [options.pageSize] - Size of the page, to used only with paginated query
	 * @param {String} [options.order] [asc] - Order of the items
	 */
	fetch(options) {
		this.fetching = true;

		options = _.defaults(_.clone(options || {}), {
			parse: true,
			bind: true,
			query: this.query(),
			pageSize: null,
			order: ASC
		});

		let query = options.query;
		let pageSize = parseInt(options.pageSize);
		let order = options.order;

		// Prepare the collection for the loadMore function
		this.moreToLoad = true;
		this.lastQueryParams = {
			query: query,
			pageSize: pageSize,
			order: order,
			bind: options.bind
		};

		// Removes every listener if present
		this.releaseFirebase();

		// Pagination
		if (_.isNumber(pageSize) && pageSize > 0) {
			// TODO: check if it's mandatory
			// query = query.orderByKey();

			// Retrieve the page in the correct order, from the top if ASC and from
			// the bottom if DESC
			switch (order) {
				case ASC:  query = query.limitToFirst(pageSize); break;
				case DESC: query = query.limitToLast(pageSize); break;
			}
		}

		// Assign the new db_ref
		this.db_ref = query;

		// Bind Firebase events
		this.bindFirebase(options);
	}

	/**
	 * Load another set of data from Firebase
	 * @param {Object} options -
	 * @param {Function} done -
	 * @return {} -
	 */
	loadMore(options, done) {
		if (typeof options == 'function') {
			done = options;
			options = {};
		}

		if (!this.fetched || !this.moreToLoad) {
			_.defer(() => {
				return done(null, false, 0);
			});
			return this;
		}

		options = _.defaults(options || {}, {
			bind: this.lastQueryParams.bind
		});
		const oldLength = this.length;

		// Create the next page query
		let query = this.lastQueryParams.query;
		let pageSize = this.lastQueryParams.pageSize;
		let fetchPageSize = pageSize + 1; // +1 because Firebase retrieve the last record already fetched
		let order = this.lastQueryParams.order;

		// Sort results
		// TODO: check if it's mandatory
		// query = query.orderByKey();

		// Retrieve the page in the correct order, from the top if ASC and from
		// the bottom if DESC
		switch (order) {
			case ASC:
				if (this.length > 0) query = query.startAt(this.last().id);
				query = query.limitToFirst(fetchPageSize);
				break;

			case DESC:
				if (this.length > 0) query = query.endAt(this.last().id);
				query = query.limitToLast(fetchPageSize);
				break;
		}

		// Removes every listener if present
		this.releaseFirebase();

		// Assign the new db_ref
		this.db_ref = query;

		// Override success and error callbacks to control the end of list
		const success = options.success;
		const error = options.error;
		options.success = (collection, snapshot, options) => {
			const moreToLoad = this.moreToLoad = collection.length - oldLength == pageSize;
			if (success) success(collection, snapshot, options);
			if (done) done(null, moreToLoad, collection.length - oldLength, oldLength);
		};
		options.error = (collection, error, options) => {
			if (error) error(collection, error, options);
			if (done) done(error);
		};

		// Bind Firebase events
		this.bindFirebase(options);
	}

	/**
	 * Close every db listener, remember to call it when you are done with a
	 * collection. Calls every inner model .releaseFirebase() to ensure
	 * no event handler is attached.
	 * @return {FirebaseCollection} - Return self
	 */
	releaseFirebase(releaseModels = false) {
		if (this.db_ref) {
			this.db_ref.off();
		}
		if (releaseModels) {
			this.forEach((aModel) => {
				if (aModel.releaseFirebase && aModel.collection == this) {
					aModel.releaseFirebase();
				}
			});
		}
		return this;
	}

	/**
	 * Connect collection to the Firebase db. this.db_ref must be set.
	 *
	 * @return {FirebaseCollection} - Return self
	 */
	bindFirebase(options) {
		options = options || {};

		let model;
		let currentLength = this.length;

		// Necessary to bind options.success, options.error and trigger
		// backbone events
		this.db_ref.once('value', (snapshot) => {
			this.fetching = false;
			this.fetched = true;
			if (!options.bind){
				let serverAttrs = options.parse ? this.parse(snapshot.val(), options) : snapshot.val();
				this.set(serverAttrs, options);
			}
			if (options.success) options.success(this, snapshot, options);
			this.trigger('sync', this, snapshot, options);
		}, (err) => {
			if (options.error) options.error(self, err, options);
			this.trigger('error', this, err, options);
		});

		if (options.bind) {
			// Attach Firebase (C)RUD events and bind them to the collection,
			// handler's are stored into this.db_handler for a future .off() call.
			this.db_ref.on('child_added', (snapshot) => {
				this.onAdd(snapshot, options);
			});
			this.db_ref.on('child_changed', (snapshot) => {
				this.onChange(snapshot, options);
			});
			this.db_ref.on('child_removed', (snapshot) => {
				this.onRemove(snapshot, options);
			});
		}
	}

	/**
	 * Create a new model and save it to Firebase, this is the only allowed method
	 * to create a new model connect to Firebase.
	 * If the collection is not fetched the model is pushed immediatly, otherwise
	 * it will be added through child_added event listener.
	 * @param {Object} data - JSON data of the model
	 * @param {Object} options - Backbone options object passed to the Model.save() method
	 * @return {Backbone.Model} - Model created
	 */
	create(data, options) {
		data = !_.isNull(data) && !_.isUndefined(data) ? data : {}
		options = options ? _.clone(options) : {};
		// Adds an ID before the model creation, only if it's not assigned.
		if (!data[this.model.prototype.idAttribute]) {
			const key = this.getReference().push().key;
			data[this.model.prototype.idAttribute] = key;
		}
		let model = this._prepareModel(data, options);
		if (!model) return false;
		model.save(null, options);
		if (!this.fetched) {
			this.add(model);
		}
		return model;
	}

	/**
	 * Retrieve a new Firebase key
	 * @return {String} - New Firebase generated key
	 */
	createNewKey() {
		return this.getReference().push().key;
	}

	/**
	 * Clone the collection keeping the settings
	 * @return {FirebaseCollection}
	 */
	clone() {
		let newCollection = super.clone();
		newCollection.firebase        = this.firebase;
		newCollection.params          = this.params;
		// newCollection.db_ref          = this.db_ref;
		newCollection.fetched         = this.fetched;
		newCollection.lastQueryParams = this.lastQueryParams;
		newCollection.moreToLoad      = this.moreToLoad;
		return newCollection;
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

	/**
	 * Add a model to the collection
	 * @param {DataSnapshot} snapshot
	 */
	onAdd(snapshot, options) {
		let model = this.get(snapshot.key);
		if (!model) {
			let data = snapshot.val();
			switch (this.lastQueryParams.order) {
				case ASC:  this.add(data, options); break;
				case DESC: this.add(data, _.extend(options, { at: currentLength })); break;
			}
		}
	}

	/**
	 * Change a model of the collection
	 * @param {DataSnapshot} snapshot
	 */
	onChange(snapshot, options) {
		let model = this.get(snapshot.key);
		if (model) {
			model.set(snapshot.val());
		}
	}

	/**
	 * Remove a model from the collection
	 * @param {DataSnapshot} snapshot
	 */
	onRemove(snapshot, options) {
		let model = this.get(snapshot.key);
		if (model) {
			this.remove(model);
		}
	}

}

FirebaseCollection.ASC = ASC;
FirebaseCollection.DESC = DESC;
