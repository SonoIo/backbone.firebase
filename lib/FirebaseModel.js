import Backbone from "backbone";
import _ from "underscore";
import * as firebase from "firebase";
import sync from "./utils/sync";

export default class FirebaseModel extends Backbone.Model {

	constructor(model, options) {
		super(model, options);

		options = _.defaults(options || {}, {
			firebase: firebase,
			params: {}
		});

		this.firebase = options.firebase;
		this.params = options.params;
		this.childCollections = {};
		this.childModels = {};
	}

	getReference() {
		return this.firebase.database().ref().child(_.result(this, 'url'));
	}

	fetch(options) {
		this.releaseFirebase();
		this.db_ref = this.getReference();
		this.bindFirebase();
		return super.fetch(options);
	}

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

	bindFirebase() {
		this.db_ref.on('child_changed', (snapshot) => {
			this.set(snapshot.val());
		});
	}

	addChildCollection(name, childCollection) {
		this.childCollections[name] = childCollection;
	}

	removeChildCollection(name) {
		delete this.childCollections[name];
	}

	addChildModel(name, childModel) {
		this.childModels[name] = childModel;
	}

	removeChildModel(name) {
		delete this.childModels[name];
	}

}

FirebaseModel.prototype.sync = sync;
