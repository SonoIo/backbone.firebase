import _ from "underscore";
import FirebaseModel from "../../lib/FirebaseModel";
import Attachments from "./Attachments";

export default class Message extends FirebaseModel {

	constructor(attrs, options) {
		super(attrs, options);

		const id = this.get(this.idAttribute);
		if (!id) throw new Error('ID is mandatory');

		this.attachments = new Attachments(null, {
			params: {
				messageId: id
			}
		});
		this.addChildCollection('attachments', this.attachments);
	}

	url() {
		return `/messages/${this.id}`;
	}

	parse(response, options) {
		if (!this.attachments) {
			this.attachments = new Attachments(null, {
				params: {
					messageId: response.id
				}
			});
		}
		return response;
	}

}
