import FirebaseCollection from "../../lib/FirebaseCollection";
import Attachment from "./Attachment";

export default class Attachments extends FirebaseCollection {

	url() {
		return `/attachments/${this.params.messageId}`;
	}

}

Attachments.prototype.model = Attachment;
