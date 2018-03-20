import FirebaseModel from "../../lib/FirebaseModel";

export default class Attachment extends FirebaseModel {

	url() {
		return `/attachments/${this.params.messageId}/${this.id}`;
	}

}

Attachment.prototype.idAttribute = 'id';
