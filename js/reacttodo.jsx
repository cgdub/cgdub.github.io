var ListItem = function(props) {
  return (
    <li>
      <span>{props.item}</span>
      <button onClick={props.remove}>Remove</button>
    </li>
  );
};

class TodoView extends React.Component {
  constructor(props) {
    super(props);
    this.state = {value: ''};
    this.remove = this.props.remove;
  }

  handleSubmit() {
    this.props.add(this.state.value);
    this.setState({value: ''});
  }

  handleChange(event) {
    this.setState({value: event.target.value});
  }

  render() {
    var list = this.props.list.map(function(item, index) {
      var remove = function() {
        this.remove(index);
      }.bind(this);
      return <ListItem item={item} remove={remove} />;
    }.bind(this));
    return (
      <div>
        <div>Stuff to Do:</div>
        <ul>{list}</ul>
        <input type="text"
               value={this.state.value}
               onChange={this.handleChange.bind(this)} />
        <button class="add-item"
                onClick={this.handleSubmit.bind(this)}>
          Add
        </button>
      </div>
    );
  }
}

var render = function(todoList) {
  ReactDOM.render(
    <TodoView list={todoList.state}
              add={todoList.addItem.bind(todoList)}
              remove={todoList.removeItem.bind(todoList)} />,
    document.getElementById('react-example')
  );
};

class TodoList {
  constructor(state, onChange) {
    this.state = Immutable.List(state);
    this.onChange = onChange;
  }

  addItem(text) {
    this.state = this.state.push(text);
    this.onChange(this);
  }

  removeItem(index) {
    this.state = this.state.delete(index);
    this.onChange(this);
  }
}

render(new TodoList(['Buy eggs'], render));
