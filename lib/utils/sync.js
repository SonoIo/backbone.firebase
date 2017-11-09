import { Model } from "backbone";

/**
* Overriding of Backbone.sync.
* All Backbone crud calls (destroy, add, create, save...) will pipe into
* this method.
*/
const sync = function(method, model, options) {
	options = options || {};
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
		ref.update(data, (err) => {
			if (err && options.error) return options.error(ref, null, err);
			if (options.success) options.success();
		});
	} else if (method === 'update') {
		var data = {};
		if (model.collection)
			data[model.id] = model.attributes;
		else
			data = model.attributes;
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
