import Backbone from "backbone";
import _ from "underscore";
import * as firebase from "firebase";
import sync from "./utils/sync";

const ASC  = 'asc';
const DESC = 'desc';

export default class FirebaseCollection extends Backbone.Collection {

	constructor(model, options) {
		super(model, options);

		options = _.defaults(options || {}, {
			firebase: firebase,
			params: {}
		});

		this.firebase = options.firebase;
		this.params = options.params;

		this.db_handler = {};
		this.db_ref = this.getReference();
		this.fetched = false;
		this.lastQueryParams = {
			query: null,
			pageSize: null,
			order: null
		};
		this.moreToLoad = true;
	}

	getReference() {
		return this.firebase.database().ref().child(_.result(this, 'url'));
	}

	query() {
		return this.getReference();
	}

	fetch(options) {
		this.fetched = true;
		options = _.defaults(_.clone(options || {}), {
			parse: true,
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
			order: order
		};

		// Removes every listener if present
		this.releaseFirebase();

		// Pagination
		if (_.isNumber(pageSize) && pageSize > 0) {
			query = query.orderByKey();
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

		options = options || {};
		const oldLength = this.length;

		// Create the next page query
		let query = this.lastQueryParams.query;
		let pageSize = this.lastQueryParams.pageSize;
		let fetchPageSize = pageSize + 1; // +1 because Firebase retrieve the last record already fetched
		let order = this.lastQueryParams.order;

		// Sort results
		query = query.orderByKey();

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
	 *
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
			if (options.success) options.success(this, snapshot, options);
			this.trigger('sync', this, snapshot, options);
		}, (err) => {
			if (options.error) options.error(self, error, options);
			this.trigger('error', this, err, options);
		});

		// Attach Firebase (C)RUD events and bind them to the collection,
		// handler's are stored into this.db_handler for a future .off() call.
		this.db_ref.on('child_added', (data) => {
			console.log('Added', data.key, this.lastQueryParams.order);
			model = this.get(data.key);
			// if (!model) this._add(data.val(), options);
			if (!model) {
				switch (this.lastQueryParams.order) {
					case ASC:  this.add(data.val(), options); break;
					case DESC: this.add(data.val(), _.extend(options, { at: currentLength })); break;
				}
			}
		});
		this.db_ref.on('child_changed', (data) => {
			console.log('Changed', data.key);
			model = this.get(data.key);
			model.set(data.val());
		});
		this.db_ref.on('child_removed', (data) => {
			console.log('Removed', data.key);
			model = this.get(data.key);
			this.remove(model);
		});
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
			const key = this.db_ref.push().key;
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

	createNewKey() {
		return this.db_ref.push().key;
	}

}

FirebaseCollection.ASC = ASC;
FirebaseCollection.DESC = DESC;
