import FirebaseCollection from "../../lib/FirebaseCollection";
import Message from "./Message";

export default class Messages extends FirebaseCollection {

	url() {
		return '/messages';
	}

}

Messages.prototype.model = Message;
