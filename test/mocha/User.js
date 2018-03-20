import _ from "underscore";
import FirebaseModel from "../../lib/FirebaseModel";

export default class User extends FirebaseModel {

	url() {
		return '/users/' + this.id;
	}

}
