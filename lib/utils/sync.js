import { Model } from "backbone";
import _ from "underscore";
import * as firebase from "firebase";

/**
* Overriding of Backbone.sync.
* All Backbone crud calls (destroy, add, create, save...) will pipe into
* this method.
*/
const sync = function(method, model, options) {
	options = _.defaults(_.clone(options || {}), {
		created: this.options.created,
		modified: this.options.modified
	});
	this.trigger('request', this, model.db_ref || model.db_collection, options);
	const ref = model.collection ? model.collection.getReference() : model.getReference();
	if (method === 'read') {
		ref.once('value', (snapshot) => {
			if (options.success) options.success(snapshot.val());
		}, (err) => {
			if (err && options.error) options.error(ref, null, err);
		});
	} else if (method === 'create') {
		let data = model.toJSON();
		if (options.created)
			data.created = firebase.database.ServerValue.TIMESTAMP;
		if (options.modified)
			data.modified = firebase.database.ServerValue.TIMESTAMP;
		ref.update(data, (err) => {
			if (err && options.error) return options.error(ref, null, err);
			if (options.success) options.success();
		});
	} else if (method === 'update') {
		let data = model.attributes;
		if (options.created && !data.created)
			data.created = firebase.database.ServerValue.TIMESTAMP;
		if (options.modified)
			data.modified = firebase.database.ServerValue.TIMESTAMP;
		if (model.collection) {
			let tmpData = {};
			tmpData[model.id] = data;
			data = tmpData;
		}
		else {
			data = data;
		}
		ref.update(data, (err) => {
			if (err && options.error) return options.error(ref, null, err);
			if (options.success) options.success();
		});
	} else if (method === 'delete') {
		let data = {};
		data[model.id] = null;
		ref.update(data, (err) => {
			if (err && options.error) return options.error(ref, null, err);
			if (options.success) options.success();
		});
	}
	return ref;
};

export default sync;
